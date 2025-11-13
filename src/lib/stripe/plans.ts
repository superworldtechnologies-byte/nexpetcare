// ✅ Safe for client-side - no Stripe initialization
export const plans = [
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
