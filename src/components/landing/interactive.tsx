"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Small interaction primitives shared across the landing page.
 *
 * All of them are transform/opacity only, so they run on the compositor and
 * never trigger layout while scrolling.
 */

/** Scroll progress rail pinned to the very top of the viewport. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const rail = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[2px] bg-transparent">
      <div
        ref={rail}
        className="h-full origin-left bg-gradient-to-r from-accent/60 via-accent to-accent/60"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}

/**
 * Card that follows the pointer with a soft radial highlight.
 * `--mx`/`--my` are set on the element; the glow is a pseudo-layer with a
 * radial-gradient, so hover costs one style write per frame at most.
 */
export function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(hover: none)").matches) return;

    let frame = 0;
    let px = 0;
    let py = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty("--mx", `${px}px`);
      el.style.setProperty("--my", `${py}px`);
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      px = event.clientX - rect.left;
      py = event.clientY - rect.top;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={`spotlight-card ${className}`}>
      {children}
    </div>
  );
}

/**
 * Number that counts up once it enters the viewport.
 * Uses requestAnimationFrame with an ease-out curve rather than a library so it
 * stays in sync with whatever scroll engine is running.
 */
export function CountUp({
  to,
  duration = 1400,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}: {
  to: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      done.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || done.current) return;
        done.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setValue(to * eased);
          if (t < 1) window.requestAnimationFrame(tick);
        };
        window.requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/** Element that tilts toward the pointer in 3D. */
export function TiltCard({
  children,
  className = "",
  max = 6,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let rx = 0;
    let ry = 0;

    const apply = () => {
      frame = 0;
      el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      rx = -ny * max;
      ry = nx * max;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    const onLeave = () => {
      el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [max]);

  return (
    <div
      ref={ref}
      className={`transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Magnetic button: the element leans toward the pointer while it is inside a
 * surrounding field of influence, then springs back. Used on the hero CTAs so
 * they feel physically attractable rather than merely hittable.
 */
export function Magnetic({
  children,
  className = "",
  strength = 0.28,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let tx = 0;
    let ty = 0;

    const apply = () => {
      frame = 0;
      el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const radius = Math.max(rect.width, rect.height) * 1.35;
      if (dist < radius) {
        const falloff = 1 - dist / radius;
        tx = dx * strength * falloff;
        ty = dy * strength * falloff;
      } else {
        tx = 0;
        ty = 0;
      }
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [strength]);

  return (
    <div
      ref={ref}
      className={`transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Curtain that lifts as the section enters view. Pure CSS transition driven by
 * an IntersectionObserver, so it costs one class flip rather than a rAF loop.
 */
export function RevealVeil({
  children,
  className = "",
  from = "bottom",
}: {
  children: ReactNode;
  className?: string;
  from?: "bottom" | "left" | "right";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hidden =
    from === "left"
      ? "translate3d(-102%,0,0)"
      : from === "right"
        ? "translate3d(102%,0,0)"
        : "translate3d(0,102%,0)";

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        ref={ref}
        className="transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform"
        style={{ transform: shown ? "translate3d(0,0,0)" : hidden }}
      >
        {children}
      </div>
    </div>
  );
}
