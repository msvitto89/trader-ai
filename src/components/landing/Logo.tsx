import Link from "next/link";

/**
 * Stroke-only mark: a hexagonal aperture with an ascending axis through it.
 * Reads as "market structure inside a frame" at 24px and stays legible as a
 * favicon, which a filled logotype would not.
 */
export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Hexagonal frame */}
      <path d="M12 2.6 20.1 7.3v9.4L12 21.4 3.9 16.7V7.3Z" opacity="0.55" />
      {/* Ascending axis */}
      <path d="M7.6 15.4 11 11.4l2.6 2.4 3.2-4.2" />
      {/* Level marker */}
      <path d="M7.6 15.4h3.4" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5 text-white"
      aria-label="TRADIA AI home"
    >
      <span className="flex size-9 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-accent transition-colors group-hover:border-accent/40">
        <LogoMark className="size-[18px]" />
      </span>
      {!compact && (
        <span className="text-[13.5px] font-semibold tracking-[0.14em]">
          TRADIA<span className="text-gray-500"> AI</span>
        </span>
      )}
    </Link>
  );
}
