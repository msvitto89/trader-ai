const BRANDS = [
  {
    name: "Springfield",
    path: "M3 18c3.2-6.4 6.4-9.6 9.6-9.6 2.6 0 4 1.6 4 4 0 2.8-2.4 4.4-5.2 4.4",
  },
  {
    name: "Orbitc",
    path: "M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm8.4 8.4a8.4 3.6 0 0 1-16.8 0",
  },
  {
    name: "Cloud",
    path: "M7.2 18.4a4 4 0 0 1 .3-7.98 5.2 5.2 0 0 1 9.94 1.3 3.4 3.4 0 0 1-.5 6.68Z",
  },
  {
    name: "Amster",
    path: "M4.4 19 12 5l7.6 14M8 13.4h8",
  },
  {
    name: "Nexus",
    path: "M6 18V6l12 12V6",
  },
];

/**
 * Infinite brand loop.
 *
 * The seam problem in naive marquees is the track running out of content before
 * it restarts. Fix: render the set 4× in a w-max flex track and shift by -50%
 * of the doubled width, so at every frame the viewport is covered. Edge fade
 * comes from a mask-image gradient rather than overlay divs, which keeps the
 * logos at full contrast in the middle and avoids stacking-context hacks.
 */
export function BrandMarquee() {
  const track = [...BRANDS, ...BRANDS, ...BRANDS, ...BRANDS];

  return (
    <div className="mt-24">
      <p className="mb-8 text-center text-[13px] font-medium text-gray-500">
        Trusted by traders running a process
      </p>
      <div
        className="relative overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <div className="marquee-track flex w-max items-center">
          {track.map((brand, index) => (
            <div
              key={`${brand.name}-${index}`}
              className="flex flex-shrink-0 items-center gap-2.5 px-8 text-gray-500"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden
              >
                <path d={brand.path} />
              </svg>
              <span className="whitespace-nowrap text-[14px] font-medium tracking-tight">
                {brand.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
