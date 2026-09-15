export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="auth-title"
          className="bg-white rounded-2xl shadow-md border border-neutral-200 p-6 sm:p-8"
        >
          <h1
            id="auth-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="text-sm text-neutral-600 mb-6">{subtitle}</p>
          ) : null}
          {children}
        </section>
        {footer ? (
          <div className="text-center mt-4 text-sm text-neutral-600">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
