/**
 * @swagger
 * components:
 *   schemas:
 *     SubscriptionPlan:
 *       type: object
 *       required:
 *         - name
 *         - price
 *         - interval
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the subscription plan
 *         description:
 *           type: string
 *           description: Detailed description of the plan
 *         price:
 *           type: number
 *           description: Monthly/yearly price of the plan
 *         interval:
 *           type: string
 *           enum: [monthly, yearly]
 *           description: Billing interval
 *         features:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               included:
 *                 type: boolean
 *         limits:
 *           type: object
 *           properties:
 *             products:
 *               type: number
 *               description: Maximum number of products allowed
 *             services:
 *               type: number
 *               description: Maximum number of services allowed

 *             staff:
 *               type: number
 *               description: Maximum staff members allowed
 *             customDomain:
 *               type: boolean
 *               description: Whether custom domain is allowed
 *         stripeProductId:
 *           type: string
 *           description: Stripe product ID reference
 *         stripePriceId:
 *           type: string
 *           description: Stripe price ID reference
 *         isActive:
 *           type: boolean
 *           default: true
 *           description: Whether the plan is currently available
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  description: String,
  price: {
    type: Number,
    required: true,
  },
  interval: {
    type: String,
    enum: ['monthly', 'yearly'],
    required: true,
  },
  features: [{
    name: String,
    included: Boolean,
  }],
  limits: {
    products: Number,
    services: Number,

    staff: Number,
    customDomain: Boolean,
  },
  stripeProductId: String,
  stripePriceId: String,
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema); 