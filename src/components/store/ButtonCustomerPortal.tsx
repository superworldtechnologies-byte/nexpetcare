'use client';

import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface ButtonCustomerPortalProps {
  customerEmail: string;
}

export default function ButtonCustomerPortal({ customerEmail }: ButtonCustomerPortalProps) {
  const portalLink = process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_LINK;

  if (!portalLink) {
    return null;
  }

  return (
    <Button
      variant="outline"
      onClick={() => {
        window.open(
          `${portalLink}?prefilled_email=${encodeURIComponent(customerEmail)}`,
          '_blank'
        );
      }}
    >
      <ExternalLink className="w-4 h-4 mr-2" />
      Manage Billing
    </Button>
  );
}
