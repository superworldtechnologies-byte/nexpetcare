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
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata!;

      console.log('💳 Processing checkout for:', metadata.email);

      try {
        const priceId = session.line_items?.data?.[0]?.price?.id;
        const isYearly = priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_YEARLY;
        const plan = isYearly ? 'yearly' : 'monthly';

        // Hash password
        const hashedPassword = await hashPassword(metadata.storePassword);

        // ✅ Update tenant with basic Stripe info (subscription details will come from subscription.created)
        const tenant = await prisma.tenant.update({
          where: { email: metadata.email },
          data: {
            name: metadata.storeName,
            emailVerified: true,
            stripeCustomerId: session.customer as string,
            subscriptionPlan: plan,
            subscriptionStatus: 'active',
            lastPaymentDate: new Date(),
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

        console.log('✅ Tenant created/updated:', {
          slug: tenant.slug,
          stripeCustomerId: tenant.stripeCustomerId,
          plan: plan,
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
      } catch (error: any) {
        console.error('❌ Error processing checkout session:', error.message);
      }

      return NextResponse.json({ received: true });
    }

    // ========== SUBSCRIPTION CREATED ==========
    // ✅ THIS is where we get the accurate period dates
    if (event.type === 'customer.subscription.created') {
      const subscription = event.data.object as any;

      console.log('🎉 Subscription created:', subscription.id);

      // ✅ Get the accurate period dates from the subscription object
      const currentPeriodStart = subscription.current_period_start;
      const currentPeriodEnd = subscription.current_period_end;
      const priceId = subscription.items?.data?.[0]?.price?.id;

      console.log('📦 Subscription data:', {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000).toISOString() : null,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
        priceId: priceId,
      });

      // Find tenant by Stripe customer ID
      const tenant = await prisma.tenant.findUnique({
        where: { stripeCustomerId: subscription.customer as string },
      });

      if (tenant) {
        // ✅ Validate and convert timestamps
        let startDate = null;
        let endDate = null;

        if (currentPeriodStart && typeof currentPeriodStart === 'number') {
          startDate = new Date(currentPeriodStart * 1000);
        }

        if (currentPeriodEnd && typeof currentPeriodEnd === 'number') {
          endDate = new Date(currentPeriodEnd * 1000);
        }

        console.log('✅ Converted dates:', {
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
        });

        // ✅ Update tenant with subscription and period details
        const updated = await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            stripeCurrentPeriodStart: startDate, // ✅ NOW SET
            stripeCurrentPeriodEnd: endDate, // ✅ NOW SET
            nextPaymentDate: endDate, // ✅ NOW SET
            subscriptionStatus: subscription.status === 'active' ? 'active' : subscription.status,
          },
        });

        console.log('✅ Tenant subscription activated:', {
          slug: updated.slug,
          stripeSubscriptionId: updated.stripeSubscriptionId,
          stripePriceId: updated.stripePriceId,
          stripeCurrentPeriodStart: updated.stripeCurrentPeriodStart?.toISOString(),
          stripeCurrentPeriodEnd: updated.stripeCurrentPeriodEnd?.toISOString(),
          nextPaymentDate: updated.nextPaymentDate?.toISOString(),
        });
      } else {
        console.error('❌ Tenant not found for customerId:', subscription.customer);
      }

      return NextResponse.json({ received: true });
    }

    // ========== SUBSCRIPTION UPDATED ==========
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as any;

      console.log('📝 Subscription updated:', subscription.id);

      const currentPeriodStart = subscription.current_period_start;
      const currentPeriodEnd = subscription.current_period_end;

      if (currentPeriodStart && currentPeriodEnd) {
        await prisma.tenant.update({
          where: { stripeCustomerId: subscription.customer as string },
          data: {
            subscriptionStatus: subscription.status,
            stripeCurrentPeriodStart: new Date(currentPeriodStart * 1000),
            stripeCurrentPeriodEnd: new Date(currentPeriodEnd * 1000),
            nextPaymentDate: new Date(currentPeriodEnd * 1000),
          },
        });

        console.log('✅ Subscription updated with new period dates');
      }

      return NextResponse.json({ received: true });
    }

    // ========== SUBSCRIPTION DELETED ==========
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;

      console.log('🚫 Subscription deleted:', subscription.id);

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

      console.log('💰 Invoice payment succeeded:', invoice.id);

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

        // Update last payment date
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            lastPaymentDate: new Date(),
          },
        });

        console.log('✅ Payment logged');
      }

      return NextResponse.json({ received: true });
    }

    // ========== PAYMENT FAILED ==========
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as any;

      console.log('❌ Invoice payment failed:', invoice.id);

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
    console.error('Stack:', error.stack);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
