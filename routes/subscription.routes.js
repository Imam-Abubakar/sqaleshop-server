const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * /api/subscriptions/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: List of subscription plans
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   price:
 *                     type: number
 *                   interval:
 *                     type: string
 *                   features:
 *                     type: array
 *                     items:
 *                       type: string
 */
router.get('/plans', subscriptionController.getPlans);

/**
 * @swagger
 * /api/subscriptions/create-checkout-session:
 *   post:
 *     summary: Create a Stripe checkout session
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - priceId
 *             properties:
 *               priceId:
 *                 type: string
 *                 description: Stripe price ID
 *     responses:
 *       200:
 *         description: Checkout session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: Checkout session URL
 *       401:
 *         description: Not authenticated
 */
router.post('/create-checkout-session', authenticate, subscriptionController.createCheckoutSession);

/**
 * @swagger
 * /api/subscriptions/current:
 *   get:
 *     summary: Get current subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                 currentPeriodEnd:
 *                   type: string
 *                   format: date-time
 *                 plan:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: No active subscription found
 */
router.get('/current', authenticate, subscriptionController.getCurrentSubscription);

/**
 * @swagger
 * /api/subscriptions/cancel:
 *   post:
 *     summary: Cancel current subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: No active subscription found
 */
router.post('/cancel', authenticate, subscriptionController.cancelSubscription);

// Handle Stripe webhook events
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  subscriptionController.handleWebhook
);

module.exports = router;