'use client';

// Shown when a page cannot load live data. Deliberately never shows placeholder numbers.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-yellow-50 flex items-center justify-center px-6">
      <div className="max-w-md text-center bg-white border border-red-200 rounded-lg p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Could not load data</h1>
        <p className="text-gray-600 mb-6">
          The page could not read the latest information. Nothing was changed. Please try again; if this keeps
          happening, check the Worker logs in Cloudflare.
        </p>
        {error.digest && <p className="text-xs text-gray-400 mb-4">Reference: {error.digest}</p>}
        <button onClick={reset} className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-4 py-2 rounded">
          Try again
        </button>
      </div>
    </div>
  );
}
