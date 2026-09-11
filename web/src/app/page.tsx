export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-8 py-16">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl md:text-6xl font-bold text-neutral-900 mb-4">
          TokoBoss
        </h1>
        <p className="text-xl md:text-2xl text-neutral-600 mb-8">
          Inventory-first ERP for Indonesian MSMEs
        </p>
        <div className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-full shadow-md text-sm text-neutral-700">
          <span className="w-2 h-2 bg-success-500 rounded-full status-pulse"></span>
          <span className="font-medium">System Ready</span>
        </div>
      </div>
    </main>
  );
}
