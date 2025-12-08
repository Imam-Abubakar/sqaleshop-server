const Customer = require('../models/customer.model');
const Order = require('../models/order.model');
const { AppError } = require('../utils/errors');
const csv = require('csv');
const { format } = require('date-fns');
const csvParse = require('csv-parse');
const { Readable } = require('stream');
const mongoose = require('mongoose');

exports.getCustomers = async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;
  const query = { businessId: req.store.owner };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const [customers, total] = await Promise.all([
    Customer.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customer.customerId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' },
          totalSpent: { $sum: '$orders.pricing.total' },
          lastOrder: { $max: '$orders.createdAt' }
        }
      },
      { $sort: { lastOrder: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ]),
    Customer.countDocuments(query)
  ]);

  res.json({
    customers,
    total,
    pages: Math.ceil(total / limit),
    currentPage: parseInt(page)
  });
};

exports.getCustomerDetails = async (req, res) => {
  const { id } = req.params;

  const [customer] = await Customer.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id), businessId: req.store.owner } },
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'customer.customerId',
        as: 'orders'
      }
    },
    {
      $addFields: {
        orderCount: { $size: '$orders' },
        totalSpent: { $sum: '$orders.pricing.total' },
        lastOrder: { $max: '$orders.createdAt' }
      }
    }
  ]);

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  // Sort orders by date
  customer.orders = customer.orders
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(customer);
};

exports.updateCustomer = async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, notes } = req.body;

  const customer = await Customer.findOneAndUpdate(
    { _id: id, businessId: req.store.owner },
    { name, email, phone, notes },
    { new: true, runValidators: true }
  );

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  res.json(customer);
};

exports.addCustomerNote = async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    throw new AppError('Note content is required', 400);
  }

  const customer = await Customer.findOneAndUpdate(
    { _id: id, businessId: req.store.owner },
    {
      $push: {
        notes: {
          content,
          createdAt: new Date(),
          createdBy: req.user._id
        }
      }
    },
    { new: true }
  ).populate('notes.createdBy', 'name');

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  res.json(customer);
};

exports.getCustomerAnalytics = async (req, res) => {
  const { id } = req.params;
  const { timeframe = '30d' } = req.query;

  const dateFilter = {};
  const today = new Date();
  
  switch (timeframe) {
    case '7d':
      dateFilter.createdAt = { $gte: new Date(today - 7 * 24 * 60 * 60 * 1000) };
      break;
    case '30d':
      dateFilter.createdAt = { $gte: new Date(today - 30 * 24 * 60 * 60 * 1000) };
      break;
    case '90d':
      dateFilter.createdAt = { $gte: new Date(today - 90 * 24 * 60 * 60 * 1000) };
      break;
  }

  const analytics = await Order.aggregate([
    {
      $match: {
        'customer.customerId': new mongoose.Types.ObjectId(id),
        businessId: req.store.owner,
        ...dateFilter
      }
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$pricing.total' },
        averageOrderValue: { $avg: '$pricing.total' },
        orders: { $push: '$$ROOT' }
      }
    }
  ]);

  if (!analytics.length) {
    throw new AppError('No data found for this customer', 404);
  }

  res.json(analytics[0]);
};

exports.updateCustomerMetadata = async (req, res) => {
  const { id } = req.params;
  const { metadata } = req.body;

  if (!metadata || typeof metadata !== 'object') {
    throw new AppError('Invalid metadata format', 400);
  }

  const customer = await Customer.findOneAndUpdate(
    { _id: id, businessId: req.store.owner },
    { $set: { metadata } },
    { new: true }
  );

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  res.json(customer);
};

exports.exportCustomers = async (req, res) => {
  const { search } = req.query;
  const query = { businessId: req.store.owner };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const customers = await Customer.aggregate([
    { $match: query },
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'customer.customerId',
        as: 'orders'
      }
    },
    {
      $addFields: {
        orderCount: { $size: '$orders' },
        totalSpent: { $sum: '$orders.pricing.total' },
        lastOrder: { $max: '$orders.createdAt' }
      }
    }
  ]);

  const csvData = customers.map(customer => ({
    'Name': customer.name,
    'Email': customer.email,
    'Phone': customer.phone,
    'Total Orders': customer.orderCount,
    'Total Spent': customer.totalSpent,
    'Last Order Date': customer.lastOrder ? format(new Date(customer.lastOrder), 'yyyy-MM-dd') : '',
    'Tags': customer.tags.join(', '),
    'Created At': format(new Date(customer.createdAt), 'yyyy-MM-dd')
  }));

  const filename = `customers-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

  csv.stringify(csvData, { header: true })
    .pipe(res);
};

exports.bulkAction = async (req, res) => {
  const { action, customerIds } = req.body;

  switch (action) {
    case 'tag':
      const { tag } = req.body;
      await Customer.updateMany(
        { _id: { $in: customerIds }, businessId: req.store.owner },
        { $addToSet: { tags: tag } }
      );
      break;

    case 'delete':
      await Customer.deleteMany({
        _id: { $in: customerIds },
        businessId: req.store.owner
      });
      break;

    case 'export':
      const customers = await Customer.find({
        _id: { $in: customerIds },
        businessId: req.store.owner
      });
      // ... existing export logic ...
      break;

    default:
      throw new AppError('Invalid bulk action', 400);
  }

  res.json({ message: 'Bulk action completed successfully' });
};

// Create a new customer
exports.createCustomer = async (req, res) => {
  const { name, email, phone, tags, metadata } = req.body;

  if (!name || !email) {
    throw new AppError('Name and email are required', 400);
  }

  // Check if customer with email already exists for this business
  const existingCustomer = await Customer.findOne({
    businessId: req.store.owner,
    email: email.toLowerCase()
  });

  if (existingCustomer) {
    throw new AppError('Customer with this email already exists', 409);
  }

  const customer = new Customer({
    businessId: req.store.owner,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone?.trim(),
    tags: tags || [],
    metadata: metadata || {}
  });

  await customer.save();

  res.status(201).json({
    message: 'Customer created successfully',
    customer
  });
};

// Get customer by ID
exports.getCustomerById = async (req, res) => {
  const { customerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new AppError('Invalid customer ID', 400);
  }

  const [customer] = await Customer.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(customerId), businessId: req.store.owner } },
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'customer.customerId',
        as: 'orders'
      }
    },
    {
      $addFields: {
        orderCount: { $size: '$orders' },
        totalSpent: { $sum: '$orders.pricing.total' },
        lastOrder: { $max: '$orders.createdAt' }
      }
    }
  ]);

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  // Sort orders by date
  customer.orders = customer.orders
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(customer);
};

// Delete customer
exports.deleteCustomer = async (req, res) => {
  const { customerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new AppError('Invalid customer ID', 400);
  }

  // Check if customer has orders
  const orderCount = await Order.countDocuments({
    'customer.customerId': new mongoose.Types.ObjectId(customerId),
    businessId: req.store.owner
  });

  if (orderCount > 0) {
    throw new AppError('Cannot delete customer with existing orders', 400);
  }

  const customer = await Customer.findOneAndDelete({
    _id: customerId,
    businessId: req.store.owner
  });

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  res.json({
    message: 'Customer deleted successfully'
  });
};

// Get customer orders
exports.getCustomerOrders = async (req, res) => {
  const { customerId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new AppError('Invalid customer ID', 400);
  }

  // Verify customer exists and belongs to business
  const customer = await Customer.findOne({
    _id: customerId,
    businessId: req.store.owner
  });

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  const [orders, total] = await Promise.all([
    Order.find({
      'customer.customerId': new mongoose.Types.ObjectId(customerId),
      businessId: req.store.owner
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .populate('items.product', 'name price'),
    Order.countDocuments({
      'customer.customerId': new mongoose.Types.ObjectId(customerId),
      businessId: req.store.owner
    })
  ]);

  res.json({
    orders,
    total,
    pages: Math.ceil(total / limit),
    currentPage: parseInt(page)
  });
};

exports.importCustomers = async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const results = [];
  const errors = [];

  await new Promise((resolve, reject) => {
    const parser = csvParse.parse({
      columns: true,
      skip_empty_lines: true
    });

    parser.on('readable', async () => {
      let record;
      while ((record = parser.read())) {
        try {
          const customer = new Customer({
            businessId: req.store.owner,
            name: record.Name,
            email: record.Email,
            phone: record.Phone,
            tags: record.Tags ? record.Tags.split(',').map(t => t.trim()) : []
          });
          await customer.save();
          results.push(customer);
        } catch (error) {
          errors.push({
            row: record,
            error: error.message
          });
        }
      }
    });

    parser.on('error', reject);
    parser.on('end', resolve);

    const stream = Readable.from(req.file.buffer);
    stream.pipe(parser);
  });

  res.json({
    imported: results.length,
    errors: errors.length ? errors : undefined
  });
};

// Get customer statistics
exports.getCustomerStats = async (req, res) => {
  const businessId = req.store.owner;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get basic customer stats
  const [
    totalCustomers,
    newThisMonth,
    activeCustomers,
    customerGrowth,
    customerSpending
  ] = await Promise.all([
    Customer.countDocuments({ businessId }),
    Customer.countDocuments({ businessId, createdAt: { $gte: thirtyDaysAgo } }),
    Customer.countDocuments({ 
      businessId,
      updatedAt: { $gte: thirtyDaysAgo }
    }),
    Customer.aggregate([
      { $match: { businessId, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } },
      {
        $project: {
          date: "$_id",
          count: 1,
          _id: 0
        }
      }
    ]),
    Customer.aggregate([
      { $match: { businessId } },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' },
          totalSpent: { $sum: '$orders.total' }
        }
      },
      {
        $group: {
          _id: null,
          avgCustomerValue: { $avg: '$totalSpent' },
          totalRevenue: { $sum: '$totalSpent' }
        }
      }
    ])
  ]);

  // Customer segmentation based on order count
  const customerSegmentation = await Customer.aggregate([
    { $match: { businessId } },
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'customerId',
        as: 'orders'
      }
    },
    {
      $addFields: {
        orderCount: { $size: '$orders' }
      }
    },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $eq: ['$orderCount', 0] }, then: 'new' },
              { case: { $lte: ['$orderCount', 3] }, then: 'regular' },
              { case: { $gt: ['$orderCount', 3] }, then: 'vip' }
            ],
            default: 'new'
          }
        },
        count: { $sum: 1 }
      }
    }
  ]);

  const segmentation = {
    new: 0,
    regular: 0,
    vip: 0
  };

  customerSegmentation.forEach(segment => {
    segmentation[segment._id] = segment.count;
  });

  res.json({
    totalCustomers,
    newThisMonth,
    activeCustomers,
    avgCustomerValue: customerSpending[0]?.avgCustomerValue || 0,
    customerGrowth,
    customerSegmentation: segmentation
  });
}; 