import { Suspense } from 'react';
import PricingPageContent from './PricingPageContent';

export default function Page() {
  return (
    <Suspense fallback={<PricingPageSkeleton />}>
      <PricingPageContent />
    </Suspense>
  );
}

function PricingPageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading pricing...</p>
      </div>
    </div>
  );
}
