const Stripe = require('stripe');

class StripeService {
  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }
    
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16', // Use the latest stable API version
      typescript: false,
    });
  }

  async createCustomer(email, metadata = {}) {
    return this.stripe.customers.create({
      email,
      metadata
    });
  }

  async createSubscription(customerId, priceId) {
    return this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
  }

  async createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
    return this.stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async cancelSubscription(subscriptionId) {
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  async getSubscription(subscriptionId) {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async constructWebhookEvent(payload, signature) {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }
}

module.exports = new StripeService();