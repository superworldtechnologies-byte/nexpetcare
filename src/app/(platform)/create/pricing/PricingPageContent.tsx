'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';

// ✅ Define plans directly in the component
const plans = [
  {
    id: 'monthly',
    name: 'Monthly Plan',
    price: 49,
    currency: '$',
    duration: 'month',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY!,
    features: [
      'Unlimited appointments',
      'Customer management',
      'Service management',
      'Email notifications',
      'Analytics dashboard',
      'Team members (up to 5)',
    ],
  },
  {
    id: 'yearly',
    name: 'Yearly Plan',
    price: 499,
    currency: '$',
    duration: 'year',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_YEARLY!,
    features: [
      'Everything in Monthly',
      'Save $89 compared to monthly',
      'Priority support',
      'Custom branding',
      'Advanced analytics',
      'Unlimited team members',
    ],
    popular: true,
    savings: '15%',
  },
];

export default function PricingPageContent() {
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<string>('yearly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const email = searchParams.get('email');
  const formDataStr = searchParams.get('formData');

  if (!email || !formDataStr) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <p className="text-red-600">Missing required data. Please restart the signup process.</p>
      </div>
    );
  }

  let formData;
  try {
    formData = JSON.parse(decodeURIComponent(formDataStr));
  } catch {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <p className="text-red-600">Invalid form data. Please restart the signup process.</p>
      </div>
    );
  }

  const handleSelectPlan = async (planId: string) => {
    setLoading(true);
    setError('');

    try {
      const plan = plans.find((p) => p.id === planId);

      if (!plan?.priceId) {
        throw new Error('Invalid plan selected');
      }

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          priceId: plan.priceId,
          metadata: formData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();

      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || 'Failed to proceed to payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Start managing your pet care business with powerful tools. Cancel anytime.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-8 max-w-2xl mx-auto">
            {error}
          </div>
        )}

        {/* Plan Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-full p-1 shadow-sm border border-gray-200">
            <button
              onClick={() => setSelectedPlan('monthly')}
              className={`px-6 py-2 rounded-full font-medium transition-all ${
                selectedPlan === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setSelectedPlan('yearly')}
              className={`px-6 py-2 rounded-full font-medium transition-all ${
                selectedPlan === 'yearly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly <span className="text-xs ml-1">(Save 15%)</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl shadow-xl overflow-hidden transition-all transform hover:scale-105 ${
                plan.popular ? 'ring-2 ring-blue-600 md:scale-105' : ''
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 text-sm font-bold rounded-bl-2xl">
                  MOST POPULAR
                </div>
              )}

              <div className="p-8">
                {/* Plan Header */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">{plan.name}</h2>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-extrabold">{plan.currency}{plan.price}</span>
                    <span className="text-gray-600">/{plan.duration}</span>
                  </div>
                  {plan.savings && (
                    <p className="text-sm text-green-600 font-semibold mt-2">
                      💰 Save {plan.savings}
                    </p>
                  )}
                </div>

                {/* CTA Button */}
                <Button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={loading}
                  className={`w-full py-6 text-lg font-bold mb-8 ${
                    plan.popular
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                      : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Get Started with ${plan.name}`
                  )}
                </Button>

                {/* Features List */}
                <div className="space-y-4">
                  <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                    What's included:
                  </p>
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-green-600" />
                      </div>
                      <span className="text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="mt-16 text-center">
          <div className="flex justify-center items-center gap-8 flex-wrap">
            <div className="flex items-center gap-2 text-gray-600">
              <Check className="w-5 h-5 text-green-600" />
              <span>14-day free trial</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Check className="w-5 h-5 text-green-600" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Check className="w-5 h-5 text-green-600" />
              <span>Secure payment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
