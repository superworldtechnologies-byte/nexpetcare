// ✅ Server-side only - never imported in client components
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
  typescript: true,
});

export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
