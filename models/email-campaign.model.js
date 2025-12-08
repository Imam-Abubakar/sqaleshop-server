const mongoose = require('mongoose');

const emailCampaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  recipientType: {
    type: String,
    enum: ['all_users', 'store_owners', 'managers', 'customers', 'custom'],
    required: true,
  },
  customRecipients: [{
    email: String,
    name: String,
  }],
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'],
    default: 'draft',
  },
  scheduledAt: {
    type: Date,
  },
  sentAt: {
    type: Date,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  stats: {
    totalSent: {
      type: Number,
      default: 0,
    },
    delivered: {
      type: Number,
      default: 0,
    },
    opened: {
      type: Number,
      default: 0,
    },
    clicked: {
      type: Number,
      default: 0,
    },
    bounced: {
      type: Number,
      default: 0,
    },
    unsubscribed: {
      type: Number,
      default: 0,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
emailCampaignSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for better performance
emailCampaignSchema.index({ status: 1, scheduledAt: 1 });
emailCampaignSchema.index({ author: 1 });

/**
 * @swagger
 * components:
 *   schemas:
 *     EmailCampaign:
 *       type: object
 *       required:
 *         - name
 *         - subject
 *         - content
 *         - recipientType
 *         - author
 *       properties:
 *         name:
 *           type: string
 *           description: Campaign name
 *         subject:
 *           type: string
 *           description: Email subject line
 *         content:
 *           type: string
 *           description: Email content (HTML)
 *         recipientType:
 *           type: string
 *           enum: [all_users, store_owners, managers, customers, custom]
 *           description: Type of recipients
 *         customRecipients:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *         status:
 *           type: string
 *           enum: [draft, scheduled, sending, sent, failed]
 *           default: draft
 *         scheduledAt:
 *           type: string
 *           format: date-time
 *         sentAt:
 *           type: string
 *           format: date-time
 *         author:
 *           type: string
 *           description: ID of the campaign author
 *         stats:
 *           type: object
 *           properties:
 *             totalSent:
 *               type: number
 *             delivered:
 *               type: number
 *             opened:
 *               type: number
 *             clicked:
 *               type: number
 *             bounced:
 *               type: number
 *             unsubscribed:
 *               type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = mongoose.model('EmailCampaign', emailCampaignSchema);
