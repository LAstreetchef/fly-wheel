// server/services/stripe.js
// Stripe payment processing

import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const PRIME_TIERS = {
  starter: {
    name: 'Starter',
    boosts: 30,
    priceId: process.env.STRIPE_PRICE_STARTER,
  },
  growth: {
    name: 'Growth',
    boosts: 100,
    priceId: process.env.STRIPE_PRICE_GROWTH,
  },
  scale: {
    name: 'Scale',
    boosts: 500,
    priceId: process.env.STRIPE_PRICE_SCALE,
  },
};

export async function createBoostCheckout({ email, productData, blog, content, successUrl, cancelUrl }) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `DAUfinder Boost: ${productData.name}`,
          description: `Promotional tweet for "${productData.name}"`,
        },
        unit_amount: 199, // $1.99
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: successUrl || 'https://daufinder.com?status=success&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: cancelUrl || 'https://daufinder.com?status=cancelled',
    metadata: {
      email,
      productData: JSON.stringify(productData),
      blog: JSON.stringify(blog),
      content,
    },
  });

  return { sessionId: session.id, url: session.url };
}

export async function createPrimeSubscription({ email, tier, successUrl, cancelUrl }) {
  const tierConfig = PRIME_TIERS[tier];
  if (!tierConfig) throw new Error(`Invalid tier: ${tier}`);
  if (!tierConfig.priceId) throw new Error(`Price ID not configured for tier: ${tier}`);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      price: tierConfig.priceId,
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: successUrl || 'https://daufinder.com?status=subscribed&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: cancelUrl || 'https://daufinder.com?status=cancelled',
    metadata: {
      email,
      tier,
      boosts: tierConfig.boosts.toString(),
    },
  });

  return { sessionId: session.id, url: session.url };
}

export function getTiers() {
  return PRIME_TIERS;
}
