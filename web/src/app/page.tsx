export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-b from-gray-50 to-gray-200">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">TokoBoss</h1>
        <p className="text-xl text-gray-600 mb-8">Inventory-first ERP for Indonesian MSMEs</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm text-sm text-gray-700">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse-dot"></span>
          <span>System Ready</span>
        </div>
      </div>
    </main>
  );
}
