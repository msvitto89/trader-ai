import Link from "next/link";

/**
 * Global not-found page. Next's default 404 is unstyled and off-brand; this
 * keeps the visitor inside the product and offers the two useful exits.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md text-center">
        <p className="eyebrow text-accent">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          That page does not exist
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          The link may be outdated, or the instrument or setup it pointed to is
          no longer available.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-[6px] bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-ink"
          >
            Go to landing
          </Link>
          <Link
            href="/app"
            className="rounded-[6px] border border-hairline-2 px-4 py-2 text-[12.5px] font-medium text-ink-2"
          >
            Open workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
