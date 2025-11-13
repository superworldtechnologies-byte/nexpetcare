import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, priceId, metadata } = body;

    // ✅ Validate price ID
    if (!priceId) {
      return NextResponse.json(
        { error: 'Price ID is required' },
        { status: 400 }
      );
    }

    // ✅ Get base URL with protocol
    const baseUrl = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'http://localhost:3000';

    // ✅ Construct absolute URLs
    const successUrl = `${baseUrl}/create/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/create`;

    console.log('Creating checkout session:', {
      email,
      priceId,
      successUrl,
      cancelUrl,
    });

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId, // ✅ This must be a valid Stripe price ID
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        name: metadata.name,
        email: metadata.email,
        phone: metadata.phone,
        storeName: metadata.storeName,
        storePassword: metadata.storePassword,
      },
    });

    console.log('✅ Checkout session created:', session.id);
    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('❌ Stripe checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Checkout failed' },
      { status: 500 }
    );
  }
}
