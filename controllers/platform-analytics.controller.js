const User = require('../models/user.model');
const Store = require('../models/store.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Blog = require('../models/blog.model');
const Booking = require('../models/booking.model');
const { AppError } = require('../middleware/error.middleware');

// Get platform overview statistics
const getPlatformOverview = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalStores,
      totalOrders,
      totalProducts,
      totalBlogs,
      activeStores,
      totalBookings,
      recentUsers,
      recentOrders
    ] = await Promise.all([
      User.countDocuments(),
      Store.countDocuments(),
      Order.countDocuments(),
      Product.countDocuments(),
      Blog.countDocuments(),
      Store.countDocuments({}), // Placeholder for active stores if status field is added later
      Booking.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email createdAt role'),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate({ path: 'customer.customerId', select: 'name email' })
        .populate({ path: 'storeId', select: 'storeName businessName currency', model: 'Store' })
        .select('pricing.total pricing.currency status createdAt customer storeId')
    ]);

    // Calculate revenue by currency (sum of all order totals grouped by currency)
    const revenueByCurrency = await Order.aggregate([
      {
        $group: {
          _id: '$pricing.currency',
          totalRevenue: { $sum: '$pricing.total' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { totalRevenue: -1 }
      }
    ]);
    
    // For backward compatibility, also calculate total revenue (but this is problematic for multi-currency)
    const totalRevenue = revenueByCurrency.reduce((sum, item) => sum + item.totalRevenue, 0);

    // Get user growth over last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newUsersLast30Days = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get order growth over last 30 days
    const newOrdersLast30Days = await Order.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      overview: {
        totalUsers,
        totalStores,
        totalOrders,
        totalProducts,
        totalBlogs,
        activeStores,
        totalBookings,
        totalRevenue,
        revenueByCurrency,
        newUsersLast30Days,
        newOrdersLast30Days
      },
      recent: {
        users: recentUsers,
        orders: recentOrders
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get user analytics
const getUserAnalytics = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    // User registrations over time
    const userRegistrations = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Users by role
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // User onboarding status
    const onboardingStatus = await User.aggregate([
      {
        $group: {
          _id: '$onboardingStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      period,
      userRegistrations,
      usersByRole,
      onboardingStatus
    });
  } catch (error) {
    next(error);
  }
};

// Get store analytics
const getStoreAnalytics = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    // Store registrations over time
    const storeRegistrations = await Store.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Stores by business type
    const storesByBusinessType = await Store.aggregate([
      {
        $group: {
          _id: '$businessType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Top performing stores by revenue
    const topStoresByRevenue = await Order.aggregate([
      {
        $group: {
          _id: '$storeId',
          totalRevenue: { $sum: '$pricing.total' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'stores',
          localField: '_id',
          foreignField: '_id',
          as: 'store'
        }
      },
      {
        $unwind: '$store'
      },
      {
        $project: {
          storeName: '$store.storeName',
          businessName: '$store.businessName',
          totalRevenue: 1,
          orderCount: 1
        }
      },
      {
        $sort: { totalRevenue: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.json({
      period,
      storeRegistrations,
      storesByBusinessType,
      topStoresByRevenue
    });
  } catch (error) {
    next(error);
  }
};

// Get revenue analytics
const getRevenueAnalytics = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    // Revenue over time
    const revenueOverTime = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $in: ['completed', 'delivered'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$pricing.total' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Revenue by store
    const revenueByStore = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $in: ['completed', 'delivered'] }
        }
      },
      {
        $group: {
          _id: '$storeId',
          revenue: { $sum: '$pricing.total' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'stores',
          localField: '_id',
          foreignField: '_id',
          as: 'store'
        }
      },
      {
        $unwind: '$store'
      },
      {
        $project: {
          storeName: '$store.storeName',
          businessName: '$store.businessName',
          revenue: 1,
          orderCount: 1
        }
      },
      {
        $sort: { revenue: -1 }
      }
    ]);

    res.json({
      period,
      revenueOverTime,
      revenueByStore
    });
  } catch (error) {
    next(error);
  }
};

// Get all users with details for admin management, including plan
const getAllUsers = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      role = '', 
      onboardingStatus = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) {
      query.role = role;
    }
    
    if (onboardingStatus) {
      query.onboardingStatus = onboardingStatus;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users with pagination
    const users = await User.find(query)
      .select('name email role onboardingStatus lastLoginAt createdAt whatsappNumber plan')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);

    // Get user statistics
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          usersByRole: {
            $push: {
              role: '$role',
              onboardingStatus: '$onboardingStatus',
              plan: '$plan'
            }
          }
        }
      }
    ]);

    // Process role statistics
    const roleStats = {};
    const onboardingStats = {};
    const planStats = {};
    
    if (stats[0]?.usersByRole) {
      stats[0].usersByRole.forEach(user => {
        roleStats[user.role] = (roleStats[user.role] || 0) + 1;
        onboardingStats[user.onboardingStatus] = (onboardingStats[user.onboardingStatus] || 0) + 1;
        if (user.plan) {
          planStats[user.plan] = (planStats[user.plan] || 0) + 1;
        }
      });
    }

    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / parseInt(limit)),
        totalUsers,
        hasNext: skip + users.length < totalUsers,
        hasPrev: parseInt(page) > 1
      },
      stats: {
        totalUsers: stats[0]?.totalUsers || 0,
        roleStats,
        onboardingStats,
        planStats
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update a user's subscription plan (superadmin only)
const updateUserPlan = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { plan } = req.body;

    if (!plan || !['free', 'growth'].includes(plan)) {
      throw new AppError('Invalid plan. Allowed values are free or growth.', 400);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { plan },
      { new: true, runValidators: true }
    ).select('name email role onboardingStatus plan lastLoginAt createdAt whatsappNumber');

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      message: 'User plan updated successfully',
      user
    });
  } catch (error) {
    next(error);
  }
};

// Get all stores with details for admin management
const getAllStores = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      businessType = '', 
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { storeName: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } },
        { url: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (businessType) {
      query.businessType = businessType;
    }

    // Get total count for pagination (before fetching)
    const totalStores = await Store.countDocuments(query);

    // Get all stores matching the query (we'll paginate after sorting)
    const allStores = await Store.find(query)
      .populate('owner', 'name email')
      .select('storeName businessName url logo currency businessType createdAt owner analytics');

    // Get order and booking statistics for all stores
    const storeIds = allStores.map(store => store._id);
    const [orderStats, bookingStats] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            storeId: { $in: storeIds }
          }
        },
        {
          $group: {
            _id: '$storeId',
            totalRevenue: { $sum: '$pricing.total' },
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: {
                $cond: [{ $in: ['$status', ['completed', 'delivered']] }, 1, 0]
              }
            },
            completedRevenue: {
              $sum: {
                $cond: [{ $in: ['$status', ['completed', 'delivered']] }, '$pricing.total', 0]
              }
            },
            averageOrderValue: { $avg: '$pricing.total' }
          }
        }
      ]),
      Booking.aggregate([
        {
          $match: {
            storeId: { $in: storeIds }
          }
        },
        {
          $group: {
            _id: '$storeId',
            totalBookings: { $sum: 1 }
          }
        }
      ])
    ]);

    // Create maps of store stats
    const statsMap = {};
    orderStats.forEach(stat => {
      statsMap[stat._id.toString()] = stat;
    });
    const bookingMap = {};
    bookingStats.forEach(stat => {
      bookingMap[stat._id.toString()] = stat.totalBookings;
    });

    // Combine store data with order stats
    const storesWithStats = allStores.map(store => {
      const stats = statsMap[store._id.toString()] || {
        totalRevenue: 0,
        totalOrders: 0,
        completedOrders: 0,
        completedRevenue: 0,
        averageOrderValue: 0
      };
      const totalBookings = bookingMap[store._id.toString()] || 0;

      return {
        _id: store._id,
        storeName: store.storeName,
        businessName: store.businessName,
        url: store.url,
        logo: store.logo || '',
        currency: store.currency || 'NGN',
        businessType: store.businessType,
        createdAt: store.createdAt,
        owner: store.owner ? {
          _id: store.owner._id,
          name: store.owner.name || 'Unknown',
          email: store.owner.email || 'No email'
        } : {
          _id: null,
          name: 'Unknown',
          email: 'No email'
        },
        analytics: {
          views: store.analytics?.views || 0,
          orders: stats.totalOrders,
          revenue: stats.completedRevenue,
          totalRevenue: stats.totalRevenue,
          completedOrders: stats.completedOrders,
          averageOrderValue: stats.averageOrderValue || 0,
          bookings: totalBookings
        }
      };
    });

    // Apply sorting
    if (sortBy === 'revenue') {
      storesWithStats.sort((a, b) => {
        const aVal = a.analytics.revenue;
        const bVal = b.analytics.revenue;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
    } else if (sortBy === 'orders') {
      storesWithStats.sort((a, b) => {
        const aVal = a.analytics.orders;
        const bVal = b.analytics.orders;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
    } else if (sortBy === 'createdAt') {
      storesWithStats.sort((a, b) => {
        const aVal = new Date(a.createdAt).getTime();
        const bVal = new Date(b.createdAt).getTime();
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    // Apply pagination after sorting
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedStores = storesWithStats.slice(skip, skip + parseInt(limit));

    // Get store statistics
    const stats = await Store.aggregate([
      {
        $group: {
          _id: null,
          totalStores: { $sum: 1 },
          storesByType: {
            $push: {
              businessType: '$businessType'
            }
          }
        }
      }
    ]);

    // Process business type statistics
    const businessTypeStats = {};
    
    if (stats[0]?.storesByType) {
      stats[0].storesByType.forEach(store => {
        businessTypeStats[store.businessType] = (businessTypeStats[store.businessType] || 0) + 1;
      });
    }

    // Get overall revenue and order stats
    const overallStats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.total' },
          totalOrders: { $sum: 1 },
          completedRevenue: {
            $sum: {
              $cond: [{ $in: ['$status', ['completed', 'delivered']] }, '$pricing.total', 0]
            }
          }
        }
      }
    ]);

    res.json({
      stores: paginatedStores,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalStores / parseInt(limit)),
        totalStores,
        hasNext: skip + paginatedStores.length < totalStores,
        hasPrev: parseInt(page) > 1
      },
      stats: {
        totalStores: stats[0]?.totalStores || 0,
        businessTypeStats,
        totalRevenue: overallStats[0]?.totalRevenue || 0,
        totalOrders: overallStats[0]?.totalOrders || 0,
        completedRevenue: overallStats[0]?.completedRevenue || 0
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlatformOverview,
  getUserAnalytics,
  getStoreAnalytics,
  getRevenueAnalytics,
  getAllUsers,
  getAllStores,
  updateUserPlan
};
