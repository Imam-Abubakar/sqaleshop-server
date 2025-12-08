const mongoose = require('mongoose');
const slugify = require('slugify');

const optionValueSchema = new mongoose.Schema({
  name: String,
  price_adjustment: {
    type: Number,
    default: 0,
  },
});

const optionSchema = new mongoose.Schema({
  name: String,
  required: {
    type: Boolean,
    default: false,
  },
  values: [optionValueSchema],
});

const variantSchema = new mongoose.Schema({
  sku: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    set: (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
  },
  options: {
    type: Map,
    of: String,
  },
  price: {
    type: Number,
    required: true,
  },
  compareAtPrice: Number,
  inventory: {
    type: Number,
    default: 0,
  },
  lowStockThreshold: {
    type: Number,
    default: 5,
  },
  weight: Number,
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
  },
  barcode: String,
});

const productSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
  },
  description: {
    type: String,
    trim: true,
  },
  images: [{
    url: String,
    publicId: String,
    alt: String,
    isDefault: Boolean,
  }],
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    index: true,
  },
  basePrice: {
    type: Number,
    required: true,
    min: 0,
  },
  compareAtPrice: {
    type: Number,
    min: 0,
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    set: (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
  },
  weight: {
    type: Number,
    min: 0,
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: {
      type: String,
      enum: ['cm', 'in'],
      default: 'cm',
    },
  },
  lowStockThreshold: {
    type: Number,
    default: 5,
    min: 0,
  },
  options: [optionSchema],
  variants: [variantSchema],
  seo: {
    title: String,
    description: String,
    keywords: [String],
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft',
  },
  tags: [String],
  metadata: {
    type: Map,
    of: String,
  },
  analytics: {
    views: {
      type: Number,
      default: 0,
    },
    sales: {
      type: Number,
      default: 0,
    },
    lastViewed: Date,
  },
  isDigital: {
    type: Boolean,
    default: false,
  },
  downloadable: {
    file: {
      url: String,
      publicId: String,
      filename: String,
    },
    downloadLimit: Number,
    expiryDays: Number,
  },
  shippingRequired: {
    type: Boolean,
    default: true,
  },
  taxable: {
    type: Boolean,
    default: true,
  },
  vendor: {
    type: String,
    trim: true,
  },
  featured: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ businessId: 1, status: 1 });
productSchema.index({ businessId: 1, category: 1 });

// Pre-save hook for slug generation
productSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true });
  }
  next();
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (!this.variants.length) {
    return 'out_of_stock';
  }
  const totalStock = this.variants.reduce((sum, variant) => sum + variant.inventory, 0);
  const lowStock = this.variants.some(v => v.inventory <= v.lowStockThreshold);
  
  if (totalStock === 0) return 'out_of_stock';
  if (lowStock) return 'low_stock';
  return 'in_stock';
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - name
 *         - price
 *         - businessId
 *       properties:
 *         name:
 *           type: string
 *           description: Product name
 *         description:
 *           type: string
 *           description: Product description
 *         price:
 *           type: number
 *           description: Product price
 *         images:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of image URLs
 *         businessId:
 *           type: string
 *           description: Reference to the business
 *         status:
 *           type: string
 *           enum: [active, inactive, outOfStock]
 *           default: active
 *         inventory:
 *           type: number
 *           description: Current stock level
 *         sku:
 *           type: string
 *           description: Stock keeping unit
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = mongoose.model('Product', productSchema); 