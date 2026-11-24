"use client";

import { useEffect, useRef } from "react";

/**
 * Kinetic display type.
 *
 * Every glyph is its own element, so the headline can be animated as a field of
 * letters rather than as a block:
 *   - entrance: letters rise through a mask in sequence
 *   - proximity: letters swell and warm as the pointer passes near
 *   - scroll:    the line drifts apart slightly as the hero leaves the viewport
 *
 * Letter spacing is animated via transform/opacity only (plus a bounded
 * font-weight step), which keeps this off the layout path during scroll.
 */

interface KineticTextProps {
  text: string;
  className?: string;
  /** Applied to individual glyphs, e.g. the italic serif accent. */
  letterClassName?: string;
  delay?: number;
  /** Pointer radius in px that influences a letter. 0 disables proximity. */
  reach?: number;
  /** Scroll parallax strength; 0 disables it. */
  parallax?: number;
  as?: "h1" | "h2" | "p";
}

export function KineticText({
  text,
  className = "",
  letterClassName = "",
  delay = 0,
  reach = 190,
  parallax = 0.12,
  as: Tag = "h1",
}: KineticTextProps) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const letters = Array.from(
      root.querySelectorAll<HTMLElement>("[data-letter]"),
    );
    if (!letters.length) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      letters.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    // ── Entrance: staggered rise through the mask ──────────────────
    letters.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.transform = "translate3d(0, 118%, 0) rotate(3deg)";
      window.setTimeout(
        () => {
          el.style.transition =
            "transform 1100ms cubic-bezier(0.16, 1, 0.3, 1), opacity 900ms ease-out";
          el.style.opacity = "1";
          el.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
        },
        120 + delay * 1000 + i * 26,
      );
    });

    let frame = 0;
    let px = -9999;
    let py = -9999;

    const onPointerMove = (event: PointerEvent) => {
      px = event.clientX;
      py = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!reach) return;
        for (const el of letters) {
          // Skip while the entrance is still running: writes would fight the
          // transition and produce a stutter.
          if (el.style.opacity !== "1") continue;
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(px - cx, py - cy);
          if (dist > reach) {
            el.style.transform = "translate3d(0,0,0)";
            el.style.color = "";
            continue;
          }
          const t = 1 - dist / reach;
          const lift = -t * 9;
          const scale = 1 + t * 0.06;
          el.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
          el.style.color = `rgba(${Math.round(242 + t * 0)}, ${Math.round(
            243 - t * 79,
          )}, ${Math.round(245 - t * 180)}, 1)`;
        }
      });
    };

    // ── Scroll parallax on the whole line ──────────────────────────
    const onScroll = () => {
      if (!parallax) return;
      const rect = root.getBoundingClientRect();
      const progress = Math.max(
        -1,
        Math.min(1, 1 - rect.top / window.innerHeight),
      );
      root.style.transform = `translate3d(0, ${(progress * parallax * 90).toFixed(2)}px, 0)`;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [text, delay, reach, parallax]);

  // Split into words so wrapping still breaks at word boundaries, then letters.
  const words = text.split(" ");

  return (
    <Tag ref={rootRef as never} className={className} data-distort-skip>
      {words.map((word, wIndex) => (
        <span key={`${word}-${wIndex}`} className="inline-block whitespace-nowrap">
          {Array.from(word).map((char, cIndex) => (
            <span
              key={`${char}-${wIndex}-${cIndex}`}
              className="inline-block overflow-hidden align-bottom pb-[0.1em]"
            >
              <span
                data-letter
                className={`inline-block will-change-transform ${letterClassName}`}
              >
                {char}
              </span>
            </span>
          ))}
          {wIndex < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </Tag>
  );
}
