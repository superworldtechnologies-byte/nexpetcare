import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe, webhookSecret } from '@/lib/stripe/config';
import { prisma } from '@/lib/store/prisma';
import { hashPassword } from '@/lib/platform/password';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('❌ Webhook verification failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  console.log(`\n📥 Webhook: ${event.type}\n`);

  try {
    // ========== CHECKOUT SESSION COMPLETED ==========
    // ✅ HANDLE THIS FIRST to set stripeCustomerId
    // ========== CHECKOUT SESSION COMPLETED ==========
if (event.type === 'checkout.session.completed') {
  const session = event.data.object;
  const metadata = session.metadata!;

  console.log('💳 Processing checkout for:', metadata.email);
  console.log('Customer ID:', session.customer);

  try {
    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );

    const sub = subscription as any;

    // ✅ Validate timestamps
    const currentPeriodStart = sub.current_period_start;
    const currentPeriodEnd = sub.current_period_end;

    // ✅ Don't skip if dates are missing - still update!
    const priceId = sub.items?.data?.[0]?.price?.id;
    const isYearly = priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_YEARLY;
    const plan = isYearly ? 'yearly' : 'monthly';

    console.log('📦 Subscription:', {
      id: sub.id,
      plan,
      status: sub.status,
      periodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000).toISOString() : 'MISSING',
      periodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : 'MISSING',
    });

    // Hash password
    const hashedPassword = await hashPassword(metadata.storePassword);

    // ✅ Update tenant - ALWAYS include websiteData and dates
    const tenant = await prisma.tenant.update({
      where: { email: metadata.email },
      data: {
        name: metadata.storeName,
        emailVerified: true,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        // ✅ ALWAYS set these dates (even if null)
        stripeCurrentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000) : null,
        stripeCurrentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
        subscriptionStatus: 'active',
        subscriptionPlan: plan,
        lastPaymentDate: new Date(),
        // ✅ Set nextPaymentDate from currentPeriodEnd
        nextPaymentDate: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
        // ✅ ALWAYS set websiteData
        websiteData: {
          hero: {
            title: `Welcome to ${metadata.storeName}`,
            subtitle: 'Premium pet care services',
            image: '/default-hero.jpg',
          },
          about: 'We provide the best care for your pets.',
        },
      },
    });

    console.log('✅ Tenant updated with FULL subscription data:', {
      slug: tenant.slug,
      stripeCustomerId: tenant.stripeCustomerId,
      stripeSubscriptionId: tenant.stripeSubscriptionId,
      stripePriceId: tenant.stripePriceId,
      stripeCurrentPeriodStart: tenant.stripeCurrentPeriodStart?.toISOString(),
      stripeCurrentPeriodEnd: tenant.stripeCurrentPeriodEnd?.toISOString(),
      subscriptionPlan: tenant.subscriptionPlan,
      websiteData: tenant.websiteData ? '✅ Set' : '❌ Null',
    });

    // Create admin
    const existingAdmin = await prisma.tenantAdmin.findUnique({
      where: {
        email_tenantId: {
          email: metadata.email,
          tenantId: tenant.id,
        },
      },
    });

    if (!existingAdmin) {
      await prisma.tenantAdmin.create({
        data: {
          email: metadata.email,
          name: metadata.name,
          passwordHash: hashedPassword,
          role: 'root',
          tenantId: tenant.id,
        },
      });
      console.log('✅ Admin created');
    }

    console.log('\n🎉 CHECKOUT COMPLETE - ALL DATA SAVED\n');
  } catch (error: any) {
    console.error('❌ Error processing checkout session:', error.message);
    console.error('Stack:', error.stack);
  }

  return NextResponse.json({ received: true });
}


    // ========== SUBSCRIPTION CREATED ==========
    // ✅ NOW THIS CAN FIND THE TENANT
    if (event.type === 'customer.subscription.created') {
      const subscription = event.data.object as any;

      console.log('🎉 Subscription created:', subscription.id);
      console.log('Looking for tenant with customerId:', subscription.customer);

      // Find tenant by Stripe customer ID
      const tenant = await prisma.tenant.findUnique({
        where: { stripeCustomerId: subscription.customer as string },
      });

      if (tenant) {
        // ✅ Validate timestamps exist before using them
        const currentPeriodStart = subscription.current_period_start;
        const currentPeriodEnd = subscription.current_period_end;

        if (!currentPeriodStart || !currentPeriodEnd) {
          console.log('ℹ️ Subscription created event has valid dates already set');
          return NextResponse.json({ received: true });
        }

        // Determine plan from price ID
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const isYearly = priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_YEARLY;
        const plan = isYearly ? 'yearly' : 'monthly';

        console.log('📦 Subscription data from created event:', {
          id: subscription.id,
          plan,
          status: subscription.status,
        });

        // ✅ Ensure subscription details are set
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            subscriptionStatus: 'active',
            subscriptionPlan: plan,
          },
        });

        console.log('✅ Tenant subscription confirmed:', tenant.slug);
      } else {
        console.log('⚠️ Tenant not found - likely because checkout.session.completed already handled it');
      }

      return NextResponse.json({ received: true });
    }

    // ========== SUBSCRIPTION UPDATED ==========
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as any;

      const currentPeriodStart = subscription.current_period_start;
      const currentPeriodEnd = subscription.current_period_end;

      if (currentPeriodStart && currentPeriodEnd) {
        await prisma.tenant.update({
          where: { stripeCustomerId: subscription.customer as string },
          data: {
            subscriptionStatus: subscription.status,
            stripeCurrentPeriodStart: new Date(currentPeriodStart * 1000),
            stripeCurrentPeriodEnd: new Date(currentPeriodEnd * 1000),
          },
        });

        console.log('✅ Subscription updated');
      }

      return NextResponse.json({ received: true });
    }

    // ========== SUBSCRIPTION DELETED ==========
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;

      await prisma.tenant.update({
        where: { stripeCustomerId: subscription.customer as string },
        data: {
          subscriptionStatus: 'canceled',
          isActive: false,
        },
      });

      console.log('✅ Subscription canceled');
      return NextResponse.json({ received: true });
    }

    // ========== PAYMENT SUCCEEDED ==========
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;

      const tenant = await prisma.tenant.findUnique({
        where: { stripeCustomerId: invoice.customer },
      });

      if (tenant) {
        await prisma.paymentLog.create({
          data: {
            stripeInvoiceId: invoice.id,
            amount: Math.round(invoice.amount_paid / 100),
            status: 'succeeded',
            description: 'Subscription payment',
            tenantId: tenant.id,
          },
        });

        console.log('✅ Payment logged');
      }

      return NextResponse.json({ received: true });
    }

    // ========== PAYMENT FAILED ==========
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as any;

      const tenant = await prisma.tenant.findUnique({
        where: { stripeCustomerId: invoice.customer },
      });

      if (tenant) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            subscriptionStatus: 'past_due',
            failedPaymentAttempts: tenant.failedPaymentAttempts + 1,
          },
        });

        console.log('✅ Failed payment recorded');
      }

      return NextResponse.json({ received: true });
    }

    console.log(`ℹ️ Unhandled event: ${event.type}`);
    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
