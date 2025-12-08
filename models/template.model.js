const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  industry: {
    type: String,
    required: true,
  },
  description: String,
  preview: String,
  settings: {
    theme: {
      type: Map,
      of: String,
    },
    layout: {
      type: String,
      enum: ['grid', 'list', 'calendar'],
      default: 'grid',
    },
    colors: {
      primary: String,
      secondary: String,
      accent: String,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Template:
 *       type: object
 *       required:
 *         - name
 *         - type
 *         - content
 *       properties:
 *         name:
 *           type: string
 *           description: Template name
 *         type:
 *           type: string
 *           enum: [email, sms, whatsapp]
 *           description: Type of template
 *         subject:
 *           type: string
 *           description: Email subject line (for email templates)
 *         content:
 *           type: string
 *           description: Template content with variables
 *         variables:
 *           type: array
 *           items:
 *             type: string
 *           description: List of variables used in template
 *         isDefault:
 *           type: boolean
 *           default: false
 *           description: Whether this is a system default template
 *         businessId:
 *           type: string
 *           description: Reference to business (for custom templates)
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = mongoose.model('Template', templateSchema); 