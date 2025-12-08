const mongoose = require('mongoose');

const discountSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed_amount', 'free_shipping'],
    required: true,
  },
  value: {
    type: Number,
    required: function() {
      return this.type !== 'free_shipping';
    },
  },
  minimumPurchase: {
    type: Number,
    default: 0,
  },
  startDate: Date,
  endDate: Date,
  usageLimit: {
    perCustomer: {
      type: Number,
      default: null,
    },
    total: {
      type: Number,
      default: null,
    },
  },
  usageCount: {
    type: Number,
    default: 0,
  },
  conditions: {
    products: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    }],
    categories: [String],
    customerTags: [String],
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active',
  },
}, {
  timestamps: true,
});

// Indexes
discountSchema.index({ businessId: 1, code: 1 }, { unique: true });
discountSchema.index({ businessId: 1, status: 1 });
discountSchema.index({ endDate: 1 }, { expireAfterSeconds: 0 });

// Methods
discountSchema.methods.isValid = function(orderAmount, customer) {
  const now = new Date();
  
  if (this.status !== 'active') return false;
  if (this.startDate && this.startDate > now) return false;
  if (this.endDate && this.endDate < now) return false;
  if (this.minimumPurchase > orderAmount) return false;
  
  if (this.usageLimit.total && this.usageCount >= this.usageLimit.total) {
    return false;
  }
  
  return true;
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Discount:
 *       type: object
 *       required:
 *         - businessId
 *         - code
 *         - type
 *         - value
 *       properties:
 *         businessId:
 *           type: string
 *           description: Reference to the business
 *         code:
 *           type: string
 *           description: Discount code
 *         type:
 *           type: string
 *           enum: [percentage, fixed]
 *           description: Type of discount
 *         value:
 *           type: number
 *           description: Discount value (percentage or fixed amount)
 *         minPurchase:
 *           type: number
 *           description: Minimum purchase amount required
 *         maxDiscount:
 *           type: number
 *           description: Maximum discount amount
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: When discount becomes active
 *         endDate:
 *           type: string
 *           format: date-time
 *           description: When discount expires
 *         usageLimit:
 *           type: number
 *           description: Maximum number of times discount can be used
 *         usedCount:
 *           type: number
 *           default: 0
 *           description: Number of times discount has been used
 *         isActive:
 *           type: boolean
 *           default: true
 *           description: Whether discount is currently active
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = mongoose.model('Discount', discountSchema); 