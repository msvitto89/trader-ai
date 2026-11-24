"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary.
 *
 * Next.js ships a bare "This page couldn't load" fallback when a route throws.
 * That is indistinguishable from a network failure and gives the user nothing
 * to act on, so every route segment gets this instead: the actual message, a
 * retry, and a way back to a known-good page.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error in the console; the UI stays calm.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-hairline-2 bg-surface p-6">
        <p className="eyebrow text-bear">Something broke</p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-ink">
          This view could not be rendered
        </h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          The server is reachable, so this is a rendering problem rather than a
          connection one. Retrying usually resolves it.
        </p>

        {/* Surface the actual message: without it a client-side crash is
            indistinguishable from any other, and diagnosing it needs devtools. */}
        <div className="mt-3 rounded-[6px] border border-hairline-2 bg-surface-2 px-2.5 py-2">
          <p className="font-mono text-[11px] leading-relaxed text-ink-2">
            {error.name}: {error.message || "no message"}
          </p>
          {error.digest && (
            <p className="mt-1 font-mono text-[10.5px] text-ink-4">
              digest {error.digest}
            </p>
          )}
        </div>

        {error.stack && (
          <details className="mt-2 rounded-[6px] border border-hairline-2 bg-surface-2 px-2.5 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-ink-3">
              Stack trace
            </summary>
            <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-ink-4">
              {error.stack.split("\n").slice(0, 8).join("\n")}
            </pre>
          </details>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-[6px] bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-accent-ink"
          >
            Try again
          </button>
          <Link
            href="/app"
            className="rounded-[6px] border border-hairline-2 px-3.5 py-2 text-[12.5px] font-medium text-ink-2"
          >
            Back to workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
