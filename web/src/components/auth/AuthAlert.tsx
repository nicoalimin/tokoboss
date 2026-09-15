'use client';

export function AuthAlert({
  tone = 'error',
  children,
  testId,
}: {
  tone?: 'error' | 'info' | 'success';
  children: React.ReactNode;
  testId?: string;
}) {
  const styles =
    tone === 'error'
      ? 'bg-error-50 text-error-700 border-error-200'
      : tone === 'success'
        ? 'bg-success-50 text-success-700 border-success-200'
        : 'bg-info-50 text-info-700 border-info-200';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={testId}
      className={`rounded-lg border px-4 py-3 text-sm mb-4 ${styles}`}
    >
      {children}
    </div>
  );
}
