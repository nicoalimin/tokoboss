'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  // Redirect to a default variant ID
  useEffect(() => {
    // Navigate to a specific variant (using a placeholder ID)
    router.push('/ledger/variant_abc123');
  }, [router]);

  return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
    </div>
  );
}
