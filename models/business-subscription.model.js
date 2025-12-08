/**
 * @swagger
 * components:
 *   schemas:
 *     BusinessSubscription:
 *       type: object
 *       required:
 *         - businessId
 *         - planId
 *       properties:
 *         businessId:
 *           type: string
 *           description: Reference to the business
 *         planId:
 *           type: string
 *           description: Reference to the subscription plan
 *         status:
 *           type: string
 *           enum: [active, cancelled, past_due, unpaid]
 *           default: active
 *           description: Current subscription status
 *         stripeSubscriptionId:
 *           type: string
 *           description: Stripe subscription ID reference
 *         stripeCustomerId:
 *           type: string
 *           description: Stripe customer ID reference
 *         currentPeriodStart:
 *           type: string
 *           format: date-time
 *           description: Start date of current billing period
 *         currentPeriodEnd:
 *           type: string
 *           format: date-time
 *           description: End date of current billing period
 *         cancelAtPeriodEnd:
 *           type: boolean
 *           default: false
 *           description: Whether subscription will cancel at period end
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const mongoose = require('mongoose');

const businessSubscriptionSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'past_due', 'unpaid'],
    default: 'active',
  },
  stripeSubscriptionId: String,
  stripeCustomerId: String,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('BusinessSubscription', businessSubscriptionSchema); 