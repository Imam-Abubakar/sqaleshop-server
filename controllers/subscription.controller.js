const stripeService = require('../services/stripe.service');
const { ApiError } = require('../utils/errors');

// Define subscription plans
const SUBSCRIPTION_PLANS = [
  {
    id: 'basic',
    name: 'Basic Plan',
    price: 9.99,
    interval: 'month',
    features: [
      'Up to 100 products',
      'Basic analytics',
      'Email support',
      'Standard themes'
    ]
  },
  {
    id: 'pro',
    name: 'Pro Plan',
    price: 29.99,
    interval: 'month',
    features: [
      'Unlimited products',
      'Advanced analytics',
      'Priority support',
      'Premium themes',
      'Custom domain'
    ]
  }
];

exports.getPlans = async (req, res) => {
  try {
    res.json(SUBSCRIPTION_PLANS);
  } catch (error) {
    throw new ApiError(error.message);
  }
};

exports.createCheckoutSession = async (req, res) => {
  try {
    const { priceId } = req.body;
    const { id: userId } = req.user;

    const session = await stripeService.createCheckoutSession(
      priceId,
      userId,
      `${process.env.CLIENT_URL}/dashboard?subscription=success`,
      `${process.env.CLIENT_URL}/pricing?subscription=cancelled`
    );

    res.json({ url: session.url });
  } catch (error) {
    throw new ApiError(error.message);
  }
};

exports.handleWebhook = async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];
    const event = await stripeService.constructWebhookEvent(req.raw, sig);

    switch (event.type) {
      case 'customer.subscription.created':
        // Handle subscription created
        break;
      case 'customer.subscription.updated':
        // Handle subscription updated
        break;
      case 'customer.subscription.deleted':
        // Handle subscription cancelled
        break;
    }

    res.json({ received: true });
  } catch (error) {
    next(new ApiError(error.message, 400));
  }
};

exports.getCurrentSubscription = async (req, res, next) => {
  try {
    const { subscriptionId } = req.user;
    if (!subscriptionId) {
      return res.json({ subscription: null });
    }

    const subscription = await stripeService.getSubscription(subscriptionId);
    res.json({ subscription });
  } catch (error) {
    next(new ApiError(error.message, 400));
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    await stripeService.cancelSubscription(subscriptionId);
    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    throw new ApiError(error.message);
  }
};

exports.getSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const subscription = await stripeService.getSubscription(subscriptionId);
    res.json(subscription);
  } catch (error) {
    throw new ApiError(error.message);
  }
};