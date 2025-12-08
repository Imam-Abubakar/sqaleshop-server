const mongoose = require('mongoose');
const slugify = require('slugify');

const businessSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    unique: true,
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  customDomain: String,
  subdomain: {
    type: String,
    unique: true,
  },
  settings: {
    theme: {
      type: Map,
      of: String,
    },
    logo: String,
    colors: {
      primary: String,
      secondary: String,
    },
    notifications: {
      whatsapp: {
        type: Boolean,
        default: false,
      },
      email: {
        type: Boolean,
        default: true,
      },
    },
  },
  analytics: {
    views: {
      type: Number,
      default: 0,
    },
    orders: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    },
  },
}, {
  timestamps: true,
});

businessSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true });
    this.subdomain = this.slug;
  }
  next();
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Business:
 *       type: object
 *       required:
 *         - name
 *         - ownerId
 *       properties:
 *         name:
 *           type: string
 *           description: The business name
 *         slug:
 *           type: string
 *           description: URL-friendly version of the business name
 *         ownerId:
 *           type: string
 *           description: Reference to user who owns the business
 *         customDomain:
 *           type: string
 *           description: Custom domain if configured
 *         subdomain:
 *           type: string
 *           description: Unique subdomain for the store
 *         settings:
 *           type: object
 *           properties:
 *             theme:
 *               type: object
 *               description: Theme configuration map
 *             logo:
 *               type: string
 *               description: URL to business logo
 *             colors:
 *               type: object
 *               properties:
 *                 primary:
 *                   type: string
 *                 secondary:
 *                   type: string
 *             notifications:
 *               type: object
 *               properties:
 *                 whatsapp:
 *                   type: boolean
 *                   default: false
 *                 email:
 *                   type: boolean
 *                   default: true
 *         analytics:
 *           type: object
 *           properties:
 *             views:
 *               type: number
 *               default: 0
 *             orders:
 *               type: number
 *               default: 0
 *             revenue:
 *               type: number
 *               default: 0
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = mongoose.model('Business', businessSchema); 