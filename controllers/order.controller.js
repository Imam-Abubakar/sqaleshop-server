const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Customer = require('../models/customer.model');
const Business = require('../models/business.model');
const Store = require('../models/store.model');
const { AppError } = require('../middleware/error.middleware');
const emailService = require('../services/email.service');
const notificationService = require('../services/notification.service');
const cloudinaryService = require('../services/cloudinary.service');
const csv = require('csv-stringify');
const { format } = require('date-fns');
const mongoose = require('mongoose');

/**
 * Retry transaction helper for transient errors
 */
const retryTransaction = async (operation, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    
    try {
      const transactionOptions = {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        maxTimeMS: 60000 // 60 seconds timeout
      };
      
      session.startTransaction(transactionOptions);
      
      const result = await operation(session);
      await session.commitTransaction();
      
      return result;
    } catch (error) {
      console.error(`Transaction attempt ${attempt} failed:`, error);
      lastError = error;
      
      // Check if this is a retryable error
      const isRetryable = error.code === 251 || // NoSuchTransaction
                         error.code === 50 ||   // MaxTimeMSExpired
                         error.code === 112 ||  // WriteConflict
                         error.codeName === 'TransientTransactionError';
      
      if (!isRetryable || attempt === maxRetries) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          console.error('Error aborting transaction:', abortError);
        }
        break;
      }
      
      // Wait before retry (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error('Error aborting transaction:', abortError);
      }
    } finally {
      try {
        session.endSession();
      } catch (endError) {
        console.error('Error ending session:', endError);
      }
    }
  }
  
  throw lastError;
};

/**
 * Create order without transaction (fallback method)
 */
const createOrderWithoutTransaction = async (req) => {
  console.log('Creating order without transaction...');
  
  // Parse orderData from form data if it's a string
  let orderData = req.body;
  if (req.body.orderData && typeof req.body.orderData === 'string') {
    try {
      orderData = JSON.parse(req.body.orderData);
      console.log('Parsed orderData:', orderData);
    } catch (parseError) {
      console.error('Error parsing orderData:', parseError);
      throw new AppError('Invalid order data format', 400);
    }
  }

  const { 
    customer,
    items,
    delivery,
    payment,
    discount,
    notes,
    source = 'storefront',
    subtotal,
    total,
    isGuestOrder = false
  } = orderData;

  console.log('Customer:', customer);
  console.log('Items:', items);

  // Validate required fields
  if (!customer?.email || !customer?.name || !customer?.phone) {
    throw new AppError('Customer information is required', 400);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('Order items are required', 400);
  }

  // Get store information - handle both authenticated and public orders
  let store;
  let businessId;
  let storeId;
  
  if (req.store) {
    // Authenticated order
    console.log('Using authenticated store');
    store = req.store;
    businessId = store.owner;
    storeId = store._id;
  } else {
    // Public order - get store from headers
    console.log('Getting store from headers');
    store = await getStoreFromHeaders(req);
    businessId = store.owner;
    storeId = store._id;
  }

  console.log('Store ID:', storeId);
  console.log('Business ID:', businessId);

  if (!storeId) {
    throw new AppError('Store ID is required', 400);
  }

  // Process order items and validate products
  console.log('Starting to process order items...');
  const processedItems = [];
  let calculatedSubtotal = 0;

  for (const item of items) {
    console.log('Processing item:', item);
    console.log('Looking up product with ID:', item.productId);
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new AppError(`Product ${item.productId} not found`, 404);
    }

    // Check inventory
    if (product.inventory < item.quantity) {
      throw new AppError(`Insufficient inventory for ${product.name}`, 400);
    }

    const { variantDoc, resolvedVariantId, variantSkuFromInput } = resolveVariantSelection(product, item);

    // Use the price from the frontend, fallback to variant or product price if not provided
    const fallbackProductPrice = typeof product.price === 'number' ? product.price : product.basePrice;
    const unitPrice = item.price || variantDoc?.price || fallbackProductPrice;

    // Validate that unitPrice is a valid number
    if (isNaN(unitPrice) || unitPrice <= 0) {
      throw new AppError(`Invalid unit price for product ${product.name}`, 400);
    }

    const totalPrice = unitPrice * item.quantity;
    calculatedSubtotal += totalPrice;

    console.log(`Item: ${product.name}, Unit Price: ${unitPrice}, Quantity: ${item.quantity}, Total Price: ${totalPrice}`);

    // Create product snapshot
    const productSnapshot = {
      name: product.name,
      description: product.description,
      images: product.images,
      sku: product.sku,
    };

    const shouldIncludeVariantSnapshot = Boolean(
      resolvedVariantId ||
      item.variantId ||
      item.variantName ||
      item.variantAttributes ||
      item.options ||
      variantSkuFromInput
    );

    const processedItem = {
      product: product._id,
      productSnapshot,
      variant: resolvedVariantId || null,
      variantSnapshot: shouldIncludeVariantSnapshot ? {
        name: item.variantName || variantDoc?.name || variantDoc?.sku || variantSkuFromInput || 'Variant',
        sku: variantDoc?.sku || variantSkuFromInput,
        attributes: item.variantAttributes || item.options || variantDoc?.options || {},
      } : null,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
      options: item.options || {},
    };

    processedItems.push(processedItem);

    // Update product inventory
    product.inventory -= item.quantity;
    await product.save();
  }

  // Handle customer - create if doesn't exist, always create customer for guest orders
  console.log('Looking up existing customer...');
  
  let existingCustomer = await Customer.findOne({ 
    email: customer.email.toLowerCase().trim(),
    businessId: businessId 
  });

  if (!existingCustomer) {
    console.log('Customer not found, attempting to create new customer...');
    try {
      // Create new customer for guest checkout
      existingCustomer = new Customer({
        businessId: businessId,
        email: customer.email.toLowerCase().trim(),
        name: customer.name.trim(),
        phone: customer.phone?.trim(),
        address: customer.address?.trim(),
        // Mark as guest customer if this is a guest order
        metadata: {
          ...(isGuestOrder && { guestCustomer: true, firstOrderDate: new Date() })
        }
      });
      await existingCustomer.save();
      console.log('New customer created successfully:', existingCustomer._id);
    } catch (saveError) {
      console.log('Customer creation failed, error code:', saveError.code);
      console.log('Error details:', saveError.message);
      
      // Handle duplicate key error - try to find the customer again
      if (saveError.code === 11000) {
        console.log('Duplicate key error detected, searching for existing customer...');
        
        // Try multiple search strategies
        existingCustomer = await Customer.findOne({ 
          email: customer.email.toLowerCase().trim(),
          businessId: businessId 
        });
        
        // If still not found, try without businessId constraint (in case of data inconsistency)
        if (!existingCustomer) {
          console.log('Customer not found with businessId constraint, trying without...');
          existingCustomer = await Customer.findOne({ 
            email: customer.email.toLowerCase().trim()
          });
          
          // If found but wrong businessId, update it
          if (existingCustomer && existingCustomer.businessId.toString() !== businessId.toString()) {
            console.log('Found customer with different businessId, updating...');
            existingCustomer.businessId = businessId;
            await existingCustomer.save();
          }
        }
        
        if (!existingCustomer) {
          console.error('Customer still not found after duplicate key error');
          throw new AppError('Customer creation failed due to duplicate email and could not locate existing customer', 400);
        }
        
        console.log('Found existing customer:', existingCustomer._id);
      } else {
        throw saveError;
      }
    }
  } else {
    console.log('Found existing customer:', existingCustomer._id);
  }

  // Update existing customer information if provided data is more complete
  const updates = {};
  if (customer.name && (!existingCustomer.name || customer.name.length > existingCustomer.name.length)) {
    updates.name = customer.name.trim();
  }
  if (customer.phone && (!existingCustomer.phone || customer.phone.length > existingCustomer.phone.length)) {
    updates.phone = customer.phone.trim();
  }
  if (customer.address && (!existingCustomer.address || customer.address.length > existingCustomer.address.length)) {
    updates.address = customer.address.trim();
  }
  
  // Update metadata to track guest orders - handle Map type properly
  if (isGuestOrder) {
    const currentMetadata = existingCustomer.metadata || new Map();
    updates.metadata = {
      ...Object.fromEntries(currentMetadata),
      guestCustomer: true,
      lastGuestOrderDate: new Date()
    };
  }
  
  if (Object.keys(updates).length > 0) {
    console.log('Updating customer with new information:', updates);
    await Customer.findByIdAndUpdate(existingCustomer._id, updates);
    // Refresh customer data
    existingCustomer = await Customer.findById(existingCustomer._id);
  }

  // Calculate pricing
  const tax = 0; // Add tax calculation logic if needed
  const shippingCost = delivery?.fee || 0;
  const discountAmount = discount?.appliedAmount || 0;
  const finalTotal = calculatedSubtotal + tax + shippingCost - discountAmount;

  console.log('Pricing breakdown:', {
    calculatedSubtotal,
    tax,
    shippingCost,
    discountAmount,
    finalTotal
  });

  // Validate final total
  if (isNaN(finalTotal) || finalTotal <= 0) {
    throw new AppError('Invalid order total calculation', 400);
  }

  // Use frontend values but validate them
  const frontendSubtotal = subtotal || calculatedSubtotal;
  const frontendTotal = total || finalTotal;

  // Validate that frontend values match our calculations (allow small tolerance for rounding)
  const subtotalDiff = Math.abs(frontendSubtotal - calculatedSubtotal);
  const totalDiff = Math.abs(frontendTotal - finalTotal);
  
  if (subtotalDiff > 1 || totalDiff > 1) {
    console.warn('Frontend pricing mismatch:', {
      frontendSubtotal,
      calculatedSubtotal,
      frontendTotal,
      finalTotal
    });
    // Use our calculated values for security
  }

  // Create order
  const order = new Order({
    businessId: businessId,
    storeId: storeId,
    customer: {
      customerId: existingCustomer._id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      address: customer.address || '',
    },
    items: processedItems,
    pricing: {
      subtotal: calculatedSubtotal,
      tax,
      shipping: shippingCost,
      discount: discountAmount,
      total: finalTotal,
      currency: 'NGN',
    },
    discount: discount || {},
    shipping: {
      method: delivery?.method || 'pickup',
      cost: shippingCost,
      address: delivery?.location || {},
      deliveryInstructions: delivery?.instructions || '',
    },
    payment: {
      method: payment?.method || 'cash',
      amount: finalTotal,
      currency: 'NGN',
      ...payment,
    },
    notes: {
      customer: notes?.customer || notes || '',
      internal: notes?.internal || '',
    },
    source,
    status: 'pending',
  });

  console.log('Order object before save:', {
    items: order.items.map(item => ({
      product: item.product,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      quantity: item.quantity
    })),
    pricing: order.pricing
  });

  // Handle payment proof upload if exists
  if (req.files?.paymentProof) {
    console.log('Processing payment proof upload');
    // Convert buffer to base64 for Cloudinary upload
    const file = req.files.paymentProof[0];
    const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const uploadResult = await cloudinaryService.uploadBase64(base64Data);
    order.payment.proofOfPayment = uploadResult.url;
  }

  await order.save();

  console.log('Order created successfully:', order._id);

  // Build invoice URL for emails and responses
  const clientBaseUrl = process.env.CLIENT_URL || 'https://sqale.shop';
  const invoiceUrl = `${clientBaseUrl}/invoice/${order._id}/${order.invoiceToken}`;

  // Send confirmation email
  try {
    await emailService.sendOrderConfirmation?.(order, store, { invoiceUrl });
  } catch (emailError) {
    console.error('Failed to send order confirmation email:', emailError);
  }

  // Send notifications
  try {
    await notificationService.sendOrderNotification?.(order, store);
  } catch (notifError) {
    console.error('Failed to send order notification:', notifError);
  }

  return {
    success: true,
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      total: order.pricing.total,
      status: order.status,
      invoiceUrl,
    },
  };
};

/**
 * Create a new order
 */
// Helper function to get businessId from store
const getBusinessIdFromStore = (req) => {
  const store = req.store;
  if (!store) {
    throw new Error('Store not found');
  }
  return store.owner;
};

// Helper function to get store information for public orders
const getStoreFromHeaders = async (req) => {
  const storeId = req.headers['store-id'] || req.headers['Store-ID'];
  const storeUrl = req.headers['store-url'];
  
  if (!storeId && !storeUrl) {
    throw new AppError('Store ID or Store URL is required', 400);
  }
  
  let store;
  if (storeId) {
    store = await Store.findById(storeId);
  } else if (storeUrl) {
    store = await Store.findOne({ url: storeUrl });
  }
  
  if (!store) {
    throw new AppError('Store not found', 404);
  }
  
  return store;
};

const resolveVariantSelection = (product, item = {}) => {
  if (!product?.variants?.length) {
    return {
      variantDoc: null,
      resolvedVariantId: null,
      variantSkuFromInput: undefined,
    };
  }

  const normalize = (value) => typeof value === 'string' ? value.trim() : value;
  const normalizedVariantId = normalize(item.variantId);
  const normalizedVariantSku = normalize(item.variantSku);

  let variantDoc = null;
  let resolvedVariantId = null;

  if (normalizedVariantId && mongoose.Types.ObjectId.isValid(normalizedVariantId)) {
    variantDoc = product.variants.id(normalizedVariantId);
    if (variantDoc) {
      resolvedVariantId = variantDoc._id;
    }
  }

  const matchSku = (skuValue) => {
    if (!skuValue) return null;
    const normalizedSku = skuValue.toString().trim().toLowerCase();
    if (!normalizedSku) return null;
    return product.variants.find((variant) => variant.sku?.toLowerCase() === normalizedSku) || null;
  };

  if (!variantDoc && normalizedVariantId && typeof normalizedVariantId === 'string' && !mongoose.Types.ObjectId.isValid(normalizedVariantId)) {
    variantDoc = matchSku(normalizedVariantId);
  }

  if (!variantDoc) {
    variantDoc = matchSku(normalizedVariantSku);
  }

  if (variantDoc && !resolvedVariantId) {
    resolvedVariantId = variantDoc._id;
  }

  const variantSkuFromInput = normalizedVariantSku 
    || (typeof normalizedVariantId === 'string' && !mongoose.Types.ObjectId.isValid(normalizedVariantId)
      ? normalizedVariantId
      : undefined);

  return {
    variantDoc,
    resolvedVariantId,
    variantSkuFromInput,
  };
};

exports.createOrder = async (req, res, next) => {
  console.log('Order creation started');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  // Try with transaction first, fallback to non-transactional approach
  try {
    const result = await retryTransaction(async (session) => {
      console.log('Starting transaction operation...');
      
      // Parse orderData from form data if it's a string
      let orderData = req.body;
    if (req.body.orderData && typeof req.body.orderData === 'string') {
      try {
        orderData = JSON.parse(req.body.orderData);
        console.log('Parsed orderData:', orderData);
      } catch (parseError) {
        console.error('Error parsing orderData:', parseError);
        throw new AppError('Invalid order data format', 400);
      }
    }

    const { 
      customer,
      items,
      delivery,
      payment,
      discount,
      notes,
      source = 'storefront',
      subtotal,
      total,
      isGuestOrder = false
    } = orderData;

    console.log('Customer:', customer);
    console.log('Items:', items);

    // Validate required fields
    if (!customer?.email || !customer?.name || !customer?.phone) {
      throw new AppError('Customer information is required', 400);
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Order items are required', 400);
    }

    // Get store information - handle both authenticated and public orders
    let store;
    let businessId;
    let storeId;
    
    if (req.store) {
      // Authenticated order
      console.log('Using authenticated store');
      store = req.store;
      businessId = store.owner;
      storeId = store._id;
    } else {
      // Public order - get store from headers
      console.log('Getting store from headers');
      store = await getStoreFromHeaders(req);
      businessId = store.owner;
      storeId = store._id;
    }

    console.log('Store ID:', storeId);
    console.log('Business ID:', businessId);

    if (!storeId) {
      throw new AppError('Store ID is required', 400);
    }

    // Process order items and validate products
    console.log('Starting to process order items...');
    const processedItems = [];
    let calculatedSubtotal = 0;

    for (const item of items) {
      console.log('Processing item:', item);
      console.log('Looking up product with ID:', item.productId);
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        throw new AppError(`Product ${item.productId} not found`, 404);
      }

      // Check inventory
      if (product.inventory < item.quantity) {
        throw new AppError(`Insufficient inventory for ${product.name}`, 400);
      }

    const { variantDoc, resolvedVariantId, variantSkuFromInput } = resolveVariantSelection(product, item);

    // Use the price from the frontend, fallback to variant or product price if not provided
    const fallbackProductPrice = typeof product.price === 'number' ? product.price : product.basePrice;
    const unitPrice = item.price || variantDoc?.price || fallbackProductPrice;

      // Validate that unitPrice is a valid number
      if (isNaN(unitPrice) || unitPrice <= 0) {
        throw new AppError(`Invalid unit price for product ${product.name}`, 400);
      }

      const totalPrice = unitPrice * item.quantity;
      calculatedSubtotal += totalPrice;

      console.log(`Item: ${product.name}, Unit Price: ${unitPrice}, Quantity: ${item.quantity}, Total Price: ${totalPrice}`);

      // Create product snapshot
      const productSnapshot = {
        name: product.name,
        description: product.description,
        images: product.images,
        sku: product.sku,
      };

    const shouldIncludeVariantSnapshot = Boolean(
      resolvedVariantId ||
      item.variantId ||
      item.variantName ||
      item.variantAttributes ||
      item.options ||
      variantSkuFromInput
    );

    const processedItem = {
        product: product._id,
        productSnapshot,
      variant: resolvedVariantId || null,
      variantSnapshot: shouldIncludeVariantSnapshot ? {
        name: item.variantName || variantDoc?.name || variantDoc?.sku || variantSkuFromInput || 'Variant',
        sku: variantDoc?.sku || variantSkuFromInput,
        attributes: item.variantAttributes || item.options || variantDoc?.options || {},
      } : null,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        options: item.options || {},
      };

      processedItems.push(processedItem);

      // Update product inventory
      product.inventory -= item.quantity;
      await product.save({ session });
    }

    // Handle customer - create if doesn't exist, always create customer for guest orders
    console.log('Looking up existing customer...');
    let existingCustomer = await Customer.findOne({ 
      email: customer.email.toLowerCase().trim(),
      businessId: businessId 
    }).session(session);

    if (!existingCustomer) {
      try {
        // Create new customer for guest checkout
        existingCustomer = new Customer({
          businessId: businessId,
          email: customer.email.toLowerCase().trim(),
          name: customer.name.trim(),
          phone: customer.phone?.trim(),
          address: customer.address?.trim(),
          // Mark as guest customer if this is a guest order
          metadata: {
            ...(isGuestOrder && { guestCustomer: true, firstOrderDate: new Date() })
          }
        });
        await existingCustomer.save({ session });
      } catch (saveError) {
        // Handle duplicate key error - try to find the customer again
        if (saveError.code === 11000) {
          console.log('Customer already exists, fetching existing customer');
          existingCustomer = await Customer.findOne({ 
            email: customer.email.toLowerCase().trim(),
            businessId: businessId 
          }).session(session);
          
          if (!existingCustomer) {
            throw new AppError('Customer creation failed due to duplicate email', 400);
          }
        } else {
          throw saveError;
        }
      }
    } else {
      // Update existing customer information if provided data is more complete
      const updates = {};
      if (customer.name && (!existingCustomer.name || customer.name.length > existingCustomer.name.length)) {
        updates.name = customer.name.trim();
      }
      if (customer.phone && (!existingCustomer.phone || customer.phone.length > existingCustomer.phone.length)) {
        updates.phone = customer.phone.trim();
      }
      if (customer.address && (!existingCustomer.address || customer.address.length > existingCustomer.address.length)) {
        updates.address = customer.address.trim();
      }
      
      // Update metadata to track guest orders
      if (isGuestOrder) {
        updates.metadata = {
          ...existingCustomer.metadata,
          guestCustomer: true,
          lastGuestOrderDate: new Date()
        };
      }
      
      if (Object.keys(updates).length > 0) {
        await Customer.findByIdAndUpdate(existingCustomer._id, updates, { session });
        // Refresh customer data
        existingCustomer = await Customer.findById(existingCustomer._id).session(session);
      }
    }

    // Calculate pricing
    const tax = 0; // Add tax calculation logic if needed
    const shippingCost = delivery?.fee || 0;
    const discountAmount = discount?.appliedAmount || 0;
    const finalTotal = calculatedSubtotal + tax + shippingCost - discountAmount;

    console.log('Pricing breakdown:', {
      calculatedSubtotal,
      tax,
      shippingCost,
      discountAmount,
      finalTotal
    });

    // Validate final total
    if (isNaN(finalTotal) || finalTotal <= 0) {
      throw new AppError('Invalid order total calculation', 400);
    }

    // Use frontend values but validate them
    const frontendSubtotal = subtotal || calculatedSubtotal;
    const frontendTotal = total || finalTotal;

    // Validate that frontend values match our calculations (allow small tolerance for rounding)
    const subtotalDiff = Math.abs(frontendSubtotal - calculatedSubtotal);
    const totalDiff = Math.abs(frontendTotal - finalTotal);
    
    if (subtotalDiff > 1 || totalDiff > 1) {
      console.warn('Frontend pricing mismatch:', {
        frontendSubtotal,
        calculatedSubtotal,
        frontendTotal,
        finalTotal
      });
      // Use our calculated values for security
    }

    // Create order
    const order = new Order({
      businessId: businessId,
      storeId: storeId,
      customer: {
        customerId: existingCustomer._id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        address: customer.address || '',
      },
      items: processedItems,
      pricing: {
        subtotal: calculatedSubtotal,
        tax,
        shipping: shippingCost,
        discount: discountAmount,
        total: finalTotal,
        currency: 'NGN',
      },
      discount: discount || {},
      shipping: {
        method: delivery?.method || 'pickup',
        cost: shippingCost,
        address: delivery?.location || {},
        deliveryInstructions: delivery?.instructions || '',
      },
      payment: {
        method: payment?.method || 'cash',
        amount: finalTotal,
        currency: 'NGN',
        ...payment,
      },
      notes: {
        customer: notes?.customer || notes || '',
        internal: notes?.internal || '',
      },
      source,
      status: 'pending',
    });

    console.log('Order object before save:', {
      items: order.items.map(item => ({
        product: item.product,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        quantity: item.quantity
      })),
      pricing: order.pricing
    });

    // Handle payment proof upload if exists
    if (req.files?.paymentProof) {
      console.log('Processing payment proof upload');
      // Convert buffer to base64 for Cloudinary upload
      const file = req.files.paymentProof[0];
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const uploadResult = await cloudinaryService.uploadBase64(base64Data);
      order.payment.proofOfPayment = uploadResult.url;
    }

    await order.save({ session });

    console.log('Order created successfully:', order._id);

      // Build invoice URL for emails and responses
      const clientBaseUrl = process.env.CLIENT_URL || 'https://sqale.shop';
      const invoiceUrl = `${clientBaseUrl}/invoice/${order._id}/${order.invoiceToken}`;

      // Send confirmation email
      try {
        await emailService.sendOrderConfirmation?.(order, store, { invoiceUrl });
      } catch (emailError) {
        console.error('Failed to send order confirmation email:', emailError);
      }

      // Send notifications
      try {
        await notificationService.sendOrderNotification?.(order, store);
      } catch (notifError) {
        console.error('Failed to send order notification:', notifError);
      }

      return {
        success: true,
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          total: order.pricing.total,
          status: order.status,
          invoiceUrl,
        },
      };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Transactional order creation failed, trying non-transactional approach:', error);
    
    // Fallback to non-transactional approach
    try {
      const fallbackResult = await createOrderWithoutTransaction(req);
      res.status(201).json(fallbackResult);
    } catch (fallbackError) {
      console.error('Fallback order creation also failed:', fallbackError);
      next(fallbackError);
    }
  }
};

/**
 * Get all orders with filtering, pagination, and search
 */
exports.getOrders = async (req, res) => {
      const businessId = getBusinessIdFromStore(req);
    
    const {
      page = 1,
      limit = 20, 
    status, 
    search,
    startDate,
    endDate,
    paymentStatus,
    shippingMethod,
    source,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const query = { 
    businessId: businessId,
  };

  // Add store filter if provided
  if (req.headers['store-id']) {
    query.storeId = req.headers['store-id'];
  } else if (req.store?._id) {
    query.storeId = req.store._id;
  }
  
  // Apply filters
  if (status) {
    if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }
  }

  if (paymentStatus) {
    query['payment.status'] = paymentStatus;
  }

  if (shippingMethod) {
    query['shipping.method'] = shippingMethod;
  }

  if (source) {
    query.source = source;
  }

  // Search functionality
  if (search) {
    query.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { 'customer.email': { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } },
      { 'customer.phone': { $regex: search, $options: 'i' } },
    ];
  }

  // Date range filter
  if (startDate && endDate) {
    query.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else if (startDate) {
    query.createdAt = { $gte: new Date(startDate) };
  } else if (endDate) {
    query.createdAt = { $lte: new Date(endDate) };
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  try {
    const [orders, total, stats] = await Promise.all([
      Order.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('items.product', 'name images sku')
        .populate('customer.customerId', 'name email phone')
        .lean(),
      Order.countDocuments(query),
      Order.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.total' },
            averageOrderValue: { $avg: '$pricing.total' },
            statusCounts: {
              $push: '$status'
            }
          }
        }
      ])
    ]);

    // Process status counts
    const statusBreakdown = {};
    if (stats[0]?.statusCounts) {
      stats[0].statusCounts.forEach(status => {
        statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
      });
    }

    res.json({
      success: true,
      orders,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit),
      },
      stats: {
        totalRevenue: stats[0]?.totalRevenue || 0,
        averageOrderValue: stats[0]?.averageOrderValue || 0,
        statusBreakdown,
      }
    });

  } catch (error) {
    throw new AppError('Error fetching orders: ' + error.message, 500);
  }
};

/**
 * Get a single order by ID
 */
exports.getOrder = async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findOne({
    _id: orderId,
    businessId: getBusinessIdFromStore(req),
  })
    .populate('items.product', 'name images sku description')
    .populate('customer.customerId', 'name email phone address createdAt')
    .populate('timeline.updatedBy', 'name email');

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  res.json({
    success: true,
    order,
  });
};

/**
 * Update order status
 */
exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status, note, notifyCustomer = true } = req.body;

  const order = await Order.findOne({
    _id: orderId,
    businessId: getBusinessIdFromStore(req),
  }).populate('items.product', 'name images');

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const oldStatus = order.status;
  await order.updateStatus(status, note, req.user._id);

  // Send notifications if status changed
  if (oldStatus !== status && notifyCustomer) {
    try {
      await emailService.sendOrderStatusUpdate?.(order, req.store, oldStatus);
      if (req.store?.settings?.notifications?.whatsapp) {
        await notificationService.sendWhatsAppStatusUpdate(order, oldStatus);
      }
    } catch (error) {
      console.error('Failed to send status update notifications:', error);
    }
  }

  res.json({
    success: true,
    order,
    message: `Order status updated to ${status}`,
  });
};

/**
 * Update order payment status
 */
exports.updatePaymentStatus = async (req, res) => {
  const { orderId } = req.params;
  const { paymentStatus, transactionId, gatewayResponse } = req.body;

  const order = await Order.findOne({
    _id: orderId,
    businessId: getBusinessIdFromStore(req),
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  order.payment.status = paymentStatus;
  if (transactionId) order.payment.transactionId = transactionId;
  if (gatewayResponse) order.payment.gatewayResponse = gatewayResponse;
  
  if (paymentStatus === 'completed') {
    order.payment.processedAt = new Date();
    // Auto-update order status if payment completed
    if (order.status === 'pending') {
      await order.updateStatus('confirmed', 'Payment confirmed - order confirmed automatically', req.user._id);
    }
  }

  await order.save();

  res.json({
    success: true,
    order,
    message: `Payment status updated to ${paymentStatus}`,
  });
};

/**
 * Add note to order
 */
exports.addOrderNote = async (req, res) => {
  const { orderId } = req.params;
  const { note, isInternal = false } = req.body;

  const order = await Order.findOne({
    _id: orderId,
    businessId: getBusinessIdFromStore(req),
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  await order.addNote(note, isInternal);

  res.json({
    success: true,
    order,
    message: 'Note added successfully',
  });
};

/**
 * Cancel order
 */
exports.cancelOrder = async (req, res) => {
  const { orderId } = req.params;
  const { reason, refundAmount } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({
      _id: orderId,
      businessId: getBusinessIdFromStore(req),
    }).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    if (!order.canBeCancelled()) {
      throw new AppError('Order cannot be cancelled in current status', 400);
    }

    // Restore inventory
    for (const item of order.items) {
      const product = await Product.findById(item.product).session(session);
      if (product) {
        product.inventory += item.quantity;
        await product.save({ session });
      }
    }

    // Update order status
    await order.updateStatus('cancelled', reason || 'Order cancelled', req.user._id);

    // Handle refund if payment was processed
    if (refundAmount && order.payment.status === 'completed') {
      order.payment.status = 'refunded';
      // Add refund logic here based on payment gateway
    }

    await order.save({ session });
    await session.commitTransaction();

    // Send notifications
    try {
      await emailService.sendOrderCancellation?.(order, req.store, reason);
    } catch (error) {
      console.error('Failed to send cancellation email:', error);
    }

    res.json({
      success: true,
      order,
      message: 'Order cancelled successfully',
    });

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Process refund
 */
exports.processRefund = async (req, res) => {
  const { orderId } = req.params;
  const { amount, reason, method = 'original' } = req.body;

  const order = await Order.findOne({
    _id: orderId,
    businessId: getBusinessIdFromStore(req),
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (!order.canBeRefunded()) {
    throw new AppError('Order is not eligible for refund', 400);
  }

  const refundableBalance = order.calculateRefundAmount();

  if (!amount || amount <= 0) {
    throw new AppError('Refund amount must be greater than zero', 400);
  }

  if (refundableBalance <= 0) {
    throw new AppError('Order is already fully refunded', 400);
  }

  if (amount > refundableBalance) {
    throw new AppError(`Refund amount cannot exceed ${refundableBalance}`, 400);
  }

  // Process refund based on original payment method
  // This is where you'd integrate with payment gateways
  try {
    // Add actual refund processing logic here
    
    const processedAt = new Date();
    const paymentAmount = order.payment?.amount ?? order.pricing.total ?? 0;
    const existingRefunds = order.payment.refundedAmount || 0;
    const updatedRefundTotal = existingRefunds + amount;
    const isFullyRefunded = updatedRefundTotal >= paymentAmount;

    order.payment.refundedAmount = updatedRefundTotal;
    order.payment.refunds = order.payment.refunds || [];
    order.payment.refunds.push({
      amount,
      reason,
      method,
      processedAt,
      processedBy: req.user?._id,
    });

    if (isFullyRefunded) {
      order.payment.status = 'refunded';
      order.status = 'refunded';
    } else {
      order.payment.status = 'partially_refunded';
      if (order.status !== 'refunded') {
        order.status = 'partially_refunded';
      }
    }

    order.timeline.push({
      status: isFullyRefunded ? 'refunded' : 'partially_refunded',
      timestamp: processedAt,
      note: `Refund processed: ${amount} - ${reason || 'No reason provided'}`,
      updatedBy: req.user._id,
    });

    await order.save();

    // Send refund confirmation
    await emailService.sendRefundConfirmation?.(order, req.store, amount, reason);

    res.json({
      success: true,
      order,
      refund: {
        amount,
        method,
        reason,
        processedAt,
        totalRefunded: updatedRefundTotal,
        remainingBalance: order.calculateRefundAmount(),
      },
      message: 'Refund processed successfully',
    });

  } catch (error) {
    throw new AppError('Failed to process refund: ' + error.message, 500);
  }
};

/**
 * Update fulfillment status
 */
exports.updateFulfillment = async (req, res) => {
  const { orderId } = req.params;
  const { type, status, metadata = {} } = req.body; // type: 'packaged', 'shipped', 'delivered'

  const order = await Order.findOne({
    _id: orderId,
    businessId: getBusinessIdFromStore(req),
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const updateData = {
    status: true,
    timestamp: new Date(),
    by: req.user._id,
    ...metadata
  };

  order.fulfillment[type] = updateData;

  // Auto-update order status based on fulfillment
  if (type === 'shipped' && order.status === 'processing') {
    await order.updateStatus('shipped', 'Order shipped', req.user._id);
  } else if (type === 'delivered' && order.status === 'shipped') {
    await order.updateStatus('delivered', 'Order delivered', req.user._id);
  }

  await order.save();

  res.json({
    success: true,
    order,
    message: `Fulfillment status updated: ${type}`,
  });
};

/**
 * Export orders
 */
exports.exportOrders = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      status, 
      format: exportFormat = 'csv',
      fields = 'all'
    } = req.query;

    const query = { businessId: getBusinessIdFromStore(req) };
    
    if (req.headers['store-id']) {
      query.storeId = req.headers['store-id'];
    } else if (req.store?._id) {
      query.storeId = req.store._id;
    }
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }

    const orders = await Order.find(query)
      .populate('items.product', 'name sku')
      .populate('customer.customerId', 'name email phone')
      .lean();

    if (exportFormat === 'csv') {
      const csvData = orders.map(order => ({
        'Order Number': order.orderNumber,
        'Date': format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm:ss'),
        'Status': order.status,
        'Customer Name': order.customer.name,
        'Customer Email': order.customer.email,
        'Customer Phone': order.customer.phone,
        'Items': order.items.map(item => 
          `${item.productSnapshot.name} (${item.quantity})`
        ).join('; '),
        'Subtotal': order.pricing.subtotal,
        'Shipping': order.pricing.shipping,
        'Tax': order.pricing.tax,
        'Discount': order.pricing.discount,
        'Total': order.pricing.total,
        'Payment Method': order.payment.method,
        'Payment Status': order.payment.status,
        'Shipping Method': order.shipping.method,
        'Shipping Address': order.shipping.address ? 
          `${order.shipping.address.line1}, ${order.shipping.address.city}, ${order.shipping.address.state}` : 'N/A',
        'Notes': order.notes.customer || '',
        'Source': order.source,
      }));

      const filename = `orders-export-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      csv.stringify(csvData, { header: true }).pipe(res);
    } else {
      // JSON export
      res.json({
        success: true,
        orders,
        exportedAt: new Date(),
        total: orders.length,
      });
    }

  } catch (error) {
    throw new AppError('Export failed: ' + error.message, 500);
  }
};

/**
 * Bulk operations on orders
 */
exports.bulkAction = async (req, res) => {
  const { action, orderIds, ...actionData } = req.body;

  if (!orderIds?.length) {
    throw new AppError('No orders selected', 400);
  }

  const orders = await Order.find({
    _id: { $in: orderIds },
    businessId: req.business._id,
  });

  if (!orders.length) {
    throw new AppError('No valid orders found', 404);
  }

  let results = [];

  try {
    switch (action) {
      case 'updateStatus':
        const { status, note, notifyCustomers = true } = actionData;
        if (!status) {
          throw new AppError('Status is required', 400);
        }

        for (const order of orders) {
          await order.updateStatus(status, note, req.user._id);
          
          if (notifyCustomers) {
            try {
              await emailService.sendOrderStatusUpdate(order, req.business, order.status);
            } catch (error) {
              console.error(`Failed to notify customer for order ${order.orderNumber}:`, error);
            }
          }
        }

        results = orders;
        break;

      case 'export':
        const csvData = orders.map(order => ({
          'Order Number': order.orderNumber,
          'Date': format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm:ss'),
          'Status': order.status,
          'Customer Name': order.customer.name,
          'Customer Email': order.customer.email,
          'Total': order.pricing.total,
        }));

        const filename = `bulk-orders-export-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        return csv.stringify(csvData, { header: true }).pipe(res);

      case 'addTag':
        const { tag } = actionData;
        if (!tag) {
          throw new AppError('Tag is required', 400);
        }

        await Order.updateMany(
          { _id: { $in: orderIds }, businessId: req.business._id },
          { $addToSet: { tags: tag } }
        );

        results = await Order.find({ _id: { $in: orderIds } });
        break;

      case 'removeTag':
        const { tagToRemove } = actionData;
        if (!tagToRemove) {
          throw new AppError('Tag to remove is required', 400);
        }

        await Order.updateMany(
          { _id: { $in: orderIds }, businessId: req.business._id },
          { $pull: { tags: tagToRemove } }
        );

        results = await Order.find({ _id: { $in: orderIds } });
        break;

      default:
        throw new AppError('Invalid bulk action', 400);
    }

    res.json({
      success: true,
      message: `Bulk action '${action}' completed successfully`,
      affected: results.length,
      results,
    });

  } catch (error) {
    throw new AppError(`Bulk action failed: ${error.message}`, 500);
  }
};

/**
 * Get order analytics
 */
exports.getOrderAnalytics = async (req, res) => {
  const { 
    period = '30d', // 7d, 30d, 90d, 1y
    groupBy = 'day', // day, week, month
    startDate,
    endDate
  } = req.query;

  const query = { businessId: getBusinessIdFromStore(req) };
  
  if (req.headers['store-id']) {
    query.storeId = req.headers['store-id'];
  } else if (req.store?._id) {
    query.storeId = req.store._id;
  }

  // Set date range based on period or custom dates
  let dateFilter;
  if (startDate && endDate) {
    dateFilter = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  } else {
    const now = new Date();
    const periods = {
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      '90d': new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      '1y': new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
    };
    dateFilter = { $gte: periods[period] || periods['30d'] };
  }

  query.createdAt = dateFilter;

  try {
    const [stats, timeline, topProducts, statusBreakdown] = await Promise.all([
      // Overall stats
      Order.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$pricing.total' },
            averageOrderValue: { $avg: '$pricing.total' },
            totalItems: { $sum: { $sum: '$items.quantity' } },
          }
        }
      ]),

      // Timeline data
      Order.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: groupBy === 'day' ? { $dayOfMonth: '$createdAt' } : null,
              week: groupBy === 'week' ? { $week: '$createdAt' } : null,
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$pricing.total' },
            date: { $first: '$createdAt' },
          }
        },
        { $sort: { 'date': 1 } }
      ]),

      // Top products
      Order.aggregate([
        { $match: query },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            productName: { $first: '$items.productSnapshot.name' },
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.totalPrice' },
            orderCount: { $sum: 1 },
          }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 }
      ]),

      // Status breakdown
      Order.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: '$pricing.total' },
          }
        }
      ])
    ]);

    res.json({
      success: true,
      analytics: {
        overview: stats[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          totalItems: 0
        },
        timeline,
        topProducts,
        statusBreakdown,
        period,
        dateRange: {
          start: dateFilter.$gte,
          end: dateFilter.$lte || new Date()
        }
      }
    });

  } catch (error) {
    throw new AppError('Analytics calculation failed: ' + error.message, 500);
  }
};

/**
 * Get order summary for confirmation page
 */
exports.getOrderSummary = async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId)
    .select('orderNumber pricing.total status createdAt customer.name invoiceToken')
    .lean();

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const clientBaseUrl = process.env.CLIENT_URL || 'https://sqale.shop';
  const invoiceUrl = order.invoiceToken
    ? `${clientBaseUrl}/invoice/${order._id}/${order.invoiceToken}`
    : null;

  res.json({
    success: true,
    order: {
      id: order._id,
      orderNumber: order.orderNumber,
      total: order.pricing.total,
      status: order.status,
      createdAt: order.createdAt,
      customerName: order.customer.name,
      invoiceUrl,
    }
  });
};

/**
 * Public: Get invoice details by order ID and invoice token
 * Includes minimal business/store information for display on the invoice.
 */
exports.getPublicInvoice = async (req, res) => {
  const { orderId, token } = req.params;

  const order = await Order.findById(orderId)
    .select('-timeline -notes.internal -metadata -payment.gatewayResponse')
    .populate('items.product', 'name images sku description')
    .lean();

  if (!order || !order.invoiceToken || order.invoiceToken !== token) {
    throw new AppError('Invoice not found', 404);
  }

  // Load related business and store details for branding on the invoice
  const [business, store] = await Promise.all([
    order.businessId
      ? Business.findById(order.businessId)
          .select('name settings.logo')
          .lean()
      : null,
    order.storeId
      ? Store.findById(order.storeId)
          .select('storeName businessName logo address whatsappNumber url')
          .lean()
      : null,
  ]);

  const businessInfo = business
    ? {
        name: business.name,
        logo: business.settings?.logo || null,
      }
    : null;

  const storeInfo = store
    ? {
        name: store.storeName || store.businessName,
        logo: store.logo || null,
        whatsappNumber: store.whatsappNumber || null,
        url: store.url || null,
        address: store.address || null,
      }
    : null;

  res.json({
    success: true,
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customer: order.customer,
      items: order.items,
      pricing: order.pricing,
      shipping: order.shipping,
      status: order.status,
      payment: {
        method: order.payment?.method,
        status: order.payment?.status,
        amount: order.payment?.amount,
        currency: order.payment?.currency,
      },
      business: businessInfo,
      store: storeInfo,
    },
  });
};