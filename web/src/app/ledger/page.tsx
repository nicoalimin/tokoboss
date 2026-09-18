'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();
  
  // Redirect to the main page or a default variant 
  useEffect(() => {
    // In a real implementation, this would redirect to a specific variant
    // For now, we'll just navigate to a placeholder URL
    router.push('/ledger/variant_abc123');
  }, [router]);
  
  return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
    </div>
  );
}