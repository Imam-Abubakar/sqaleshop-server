const mongoose = require('mongoose');
const crypto = require('crypto');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  productSnapshot: {
    name: { type: String, required: true },
    description: String,
    images: [String],
    sku: String,
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product.variants',
  },
  variantSnapshot: {
    name: String,
    sku: String,
    attributes: {
      type: Map,
      of: String,
    },
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  options: {
    type: Map,
    of: String,
  },
}, {
  _id: true,
});

const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['card', 'cash', 'bank_transfer', 'bankTransfer', 'mobile_money', 'crypto', 'whatsapp'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'partially_refunded', 'refunded'],
    default: 'pending',
  },
  amount: Number,
  currency: {
    type: String,
    default: 'NGN',
  },
  transactionId: String,
  gatewayResponse: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  proofOfPayment: String, // URL to uploaded proof
  processedAt: Date,
  failureReason: String,
  refundedAmount: {
    type: Number,
    default: 0,
  },
  refunds: [{
    amount: { type: Number, required: true },
    reason: String,
    method: { type: String, default: 'original' },
    processedAt: { type: Date, default: Date.now },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  }],
}, {
  _id: true,
  timestamps: true,
});

const orderSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true,
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  },
  orderNumber: {
    type: String,
    unique: true,
    index: true,
  },
  customer: {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    email: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: String,
  },
  items: [orderItemSchema],
  pricing: {
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
  },
  discount: {
    code: String,
    type: { type: String, enum: ['percentage', 'fixed'] },
    amount: Number,
    appliedAmount: Number,
  },
  shipping: {
    method: {
      type: String,
      enum: ['pickup', 'delivery', 'shipping'],
      default: 'pickup',
    },
    cost: { type: Number, default: 0 },
    estimatedDelivery: Date,
    trackingNumber: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: { type: String, default: 'Nigeria' },
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },
    deliveryInstructions: String,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'partially_refunded', 'refunded'],
    default: 'pending',
    index: true,
  },
  payment: paymentSchema,
  timeline: [{
    status: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  notes: {
    customer: String,
    internal: String,
  },
  tags: [String],
  source: {
    type: String,
    enum: ['storefront', 'admin', 'api', 'pos'],
    default: 'storefront',
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  // Public invoice access token (for secure, shareable invoice links)
  invoiceToken: {
    type: String,
    index: true,
  },
  // Fulfillment tracking
  fulfillment: {
    packaged: {
      status: { type: Boolean, default: false },
      timestamp: Date,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    shipped: {
      status: { type: Boolean, default: false },
      timestamp: Date,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      carrier: String,
      trackingUrl: String,
    },
    delivered: {
      status: { type: Boolean, default: false },
      timestamp: Date,
      confirmedBy: String, // customer name or signature
      photo: String, // delivery photo URL
    },
  },
}, {
  timestamps: true,
});

// Indexes
orderSchema.index({ businessId: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, status: 1 });
orderSchema.index({ businessId: 1, storeId: 1 });
orderSchema.index({ businessId: 1, 'customer.email': 1 });
orderSchema.index({ businessId: 1, 'customer.phone': 1 });
orderSchema.index({ 'payment.transactionId': 1 });
orderSchema.index({ createdAt: -1 });

// Virtual for readable order total
orderSchema.virtual('formattedTotal').get(function() {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: this.pricing.currency || 'NGN'
  }).format(this.pricing.total);
});

// Virtual for current status details
orderSchema.virtual('currentStatus').get(function() {
  const latestTimeline = this.timeline[this.timeline.length - 1];
  return {
    status: this.status,
    updatedAt: latestTimeline ? latestTimeline.timestamp : this.updatedAt,
    note: latestTimeline ? latestTimeline.note : null
  };
});

// Pre-save hook for order number generation
orderSchema.pre('save', async function(next) {
  try {
    // Generate order number if new
    if (this.isNew && !this.orderNumber) {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const storePrefix = this.storeId.toString().slice(-3).toUpperCase();
      
      const count = await this.constructor.countDocuments({ 
        businessId: this.businessId,
        storeId: this.storeId,
        createdAt: {
          $gte: new Date(date.getFullYear(), date.getMonth(), 1),
          $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
        }
      });
      
      this.orderNumber = `${storePrefix}${year}${month}${(count + 1).toString().padStart(4, '0')}`;
    }

    // Generate invoice token for public invoice links
    if (this.isNew && !this.invoiceToken) {
      this.invoiceToken = crypto.randomBytes(16).toString('hex');
    }

    // Calculate totals - only for existing orders, not new ones since we calculate in controller
    if (!this.isNew && (this.isModified('items') || this.isModified('discount') || this.isModified('shipping.cost'))) {
      // Validate that all items have valid totalPrice before calculating
      const validItems = this.items.filter(item => !isNaN(item.totalPrice) && item.totalPrice > 0);
      if (validItems.length !== this.items.length) {
        return next(new Error('Some order items have invalid totalPrice values'));
      }
      
      this.pricing.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
      this.pricing.shipping = this.shipping.cost || 0;
      this.pricing.discount = this.discount ? this.discount.appliedAmount || 0 : 0;
      this.pricing.total = this.pricing.subtotal + this.pricing.tax + this.pricing.shipping - this.pricing.discount;
      
      // Validate final calculations
      if (isNaN(this.pricing.subtotal) || isNaN(this.pricing.total)) {
        return next(new Error('Invalid pricing calculation in pre-save hook'));
      }
    }

    // Update timeline on status change
    if (this.isModified('status') && !this.isNew) {
      this.timeline.push({
        status: this.status,
        timestamp: new Date(),
        note: `Status changed to ${this.status}`
      });
    }

    // Initialize timeline for new orders
    if (this.isNew) {
      this.timeline = [{
        status: this.status,
        timestamp: new Date(),
        note: 'Order created'
      }];
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
orderSchema.methods.updateStatus = function(newStatus, note, updatedBy) {
  this.status = newStatus;
  this.timeline.push({
    status: newStatus,
    timestamp: new Date(),
    note: note || `Status updated to ${newStatus}`,
    updatedBy
  });
  return this.save();
};

orderSchema.methods.addNote = function(note, isInternal = false) {
  if (isInternal) {
    this.notes.internal = this.notes.internal ? `${this.notes.internal}\n\n${note}` : note;
  } else {
    this.notes.customer = this.notes.customer ? `${this.notes.customer}\n\n${note}` : note;
  }
  return this.save();
};

orderSchema.methods.calculateRefundAmount = function() {
  const totalPaid = this.payment?.amount ?? this.pricing.total ?? 0;
  const alreadyRefunded = this.payment?.refundedAmount ?? 0;
  return Math.max(totalPaid - alreadyRefunded, 0);
};

orderSchema.methods.canBeCancelled = function() {
  return ['pending', 'confirmed'].includes(this.status);
};

orderSchema.methods.canBeRefunded = function() {
  const refundableBalance = this.calculateRefundAmount();
  const eligibleStatuses = ['delivered', 'shipped', 'partially_refunded'];
  const eligiblePaymentStatuses = ['completed', 'partially_refunded'];
  const paymentStatus = this.payment?.status;
  return refundableBalance > 0 &&
    eligibleStatuses.includes(this.status) &&
    paymentStatus &&
    eligiblePaymentStatuses.includes(paymentStatus);
};

// Static methods
orderSchema.statics.getOrderStats = function(businessId, storeId, dateRange) {
  const match = { businessId };
  if (storeId) match.storeId = storeId;
  if (dateRange) {
    match.createdAt = {
      $gte: new Date(dateRange.start),
      $lte: new Date(dateRange.end)
    };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.total' },
        averageOrderValue: { $avg: '$pricing.total' },
        statusBreakdown: {
          $push: {
            status: '$status',
            total: '$pricing.total'
          }
        }
      }
    },
    {
      $project: {
        totalOrders: 1,
        totalRevenue: 1,
        averageOrderValue: { $round: ['$averageOrderValue', 2] },
        statusCounts: {
          $arrayToObject: {
            $map: {
              input: { $setUnion: ['$statusBreakdown.status'] },
              as: 'status',
              in: {
                k: '$$status',
                v: {
                  $size: {
                    $filter: {
                      input: '$statusBreakdown',
                      cond: { $eq: ['$$this.status', '$$status'] }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]);
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       required:
 *         - businessId
 *         - storeId
 *         - customer
 *         - items
 *         - pricing
 *       properties:
 *         _id:
 *           type: string
 *           description: Order ID
 *         businessId:
 *           type: string
 *           description: Reference to the business
 *         storeId:
 *           type: string
 *           description: Reference to the store
 *         orderNumber:
 *           type: string
 *           description: Unique order identifier
 *         customer:
 *           type: object
 *           properties:
 *             customerId:
 *               type: string
 *             email:
 *               type: string
 *             name:
 *               type: string
 *             phone:
 *               type: string
 *             address:
 *               type: string
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               product:
 *                 type: string
 *               productSnapshot:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   images:
 *                     type: array
 *                     items:
 *                       type: string
 *                   sku:
 *                     type: string
 *               quantity:
 *                 type: number
 *               unitPrice:
 *                 type: number
 *               totalPrice:
 *                 type: number
 *               options:
 *                 type: object
 *         pricing:
 *           type: object
 *           properties:
 *             subtotal:
 *               type: number
 *             tax:
 *               type: number
 *             shipping:
 *               type: number
 *             discount:
 *               type: number
 *             total:
 *               type: number
 *             currency:
 *               type: string
 *         status:
 *           type: string
 *           enum: [pending, confirmed, processing, shipped, delivered, cancelled, refunded]
 *           default: pending
 *         payment:
 *           type: object
 *           properties:
 *             method:
 *               type: string
 *               enum: [card, cash, bank_transfer, mobile_money, crypto]
 *             status:
 *               type: string
 *               enum: [pending, processing, completed, failed, cancelled]
 *             amount:
 *               type: number
 *             currency:
 *               type: string
 *             transactionId:
 *               type: string
 *             proofOfPayment:
 *               type: string
 *         shipping:
 *           type: object
 *           properties:
 *             method:
 *               type: string
 *               enum: [pickup, delivery, shipping]
 *             cost:
 *               type: number
 *             estimatedDelivery:
 *               type: string
 *               format: date-time
 *             trackingNumber:
 *               type: string
 *             address:
 *               type: object
 *         timeline:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *               note:
 *                 type: string
 *               updatedBy:
 *                 type: string
 *         notes:
 *           type: object
 *           properties:
 *             customer:
 *               type: string
 *             internal:
 *               type: string
 *         source:
 *           type: string
 *           enum: [storefront, admin, api, pos]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     OrderItem:
 *       type: object
 *       required:
 *         - product
 *         - productSnapshot
 *         - quantity
 *         - unitPrice
 *         - totalPrice
 *       properties:
 *         product:
 *           type: string
 *           description: Product ID reference
 *         productSnapshot:
 *           type: object
 *           description: Product data at time of order
 *         quantity:
 *           type: number
 *           minimum: 1
 *         unitPrice:
 *           type: number
 *         totalPrice:
 *           type: number
 *         options:
 *           type: object
 *           description: Selected product options
 */

module.exports = mongoose.model('Order', orderSchema); 