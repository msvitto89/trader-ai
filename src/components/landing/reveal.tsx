"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Scroll-reveal primitives (ReactBits / SplitText-style, rebuilt with GSAP).
 *
 * The brief asked for a FadeInUp wrapper that slides from translate-y-10 +
 * opacity-0 to opacity-100 over 1000ms. This does that, plus a word-mask
 * variant for headlines and a stagger group.
 *
 * Reveals are one-shot: they never replay on scroll-up, which reads as noise
 * on a page this dense. Reduced-motion users get the final state immediately.
 */

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface FadeInUpProps {
  children: ReactNode;
  /** Delay in seconds. */
  delay?: number;
  /** Travel distance in px (brief uses translate-y-10 = 40px). */
  distance?: number;
  duration?: number;
  as?: ElementType;
  className?: string;
  /** Stagger direct children instead of animating the wrapper as one block. */
  stagger?: number;
}

export function FadeInUp({
  children,
  delay = 0,
  distance = 40,
  duration = 1,
  as: Tag = "div",
  className,
  stagger,
}: FadeInUpProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets =
      stagger != null ? Array.from(el.children) : el;

    if (prefersReduced()) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    gsap.set(targets, { opacity: 0, y: distance, willChange: "transform, opacity" });

    const tween = gsap.to(targets, {
      opacity: 1,
      y: 0,
      duration,
      delay,
      ease: "power3.out",
      stagger: stagger ?? 0,
      clearProps: "willChange",
      scrollTrigger: {
        trigger: el,
        start: "top 88%",
        once: true,
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [delay, distance, duration, stagger]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

interface RevealWordsProps {
  text: string;
  className?: string;
  delay?: number;
  /** Rendered after `text` on the same line, e.g. an italic serif accent. */
  accent?: string;
  accentClassName?: string;
  as?: ElementType;
}

/**
 * Word-by-word mask reveal. Each word sits in an overflow-hidden span and
 * slides up from below its own baseline, so glyphs are never clipped mid-line.
 */
export function RevealWords({
  text,
  className,
  delay = 0,
  accent,
  accentClassName,
  as: Tag = "h1",
}: RevealWordsProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = el.querySelectorAll<HTMLElement>("[data-word]");
    if (!words.length) return;

    if (prefersReduced()) {
      gsap.set(words, { yPercent: 0, opacity: 1 });
      return;
    }

    gsap.set(words, { yPercent: 115, opacity: 0 });

    const tween = gsap.to(words, {
      yPercent: 0,
      opacity: 1,
      duration: 1.05,
      delay,
      ease: "power4.out",
      stagger: 0.055,
    });

    return () => {
      tween.kill();
    };
  }, [delay, text, accent]);

  const words = text.split(" ");

  return (
    <Tag ref={ref} className={className}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block overflow-hidden align-bottom pb-[0.08em]"
        >
          <span data-word className="inline-block will-change-transform">
            {word}
            {i < words.length - 1 || accent ? "\u00A0" : ""}
          </span>
        </span>
      ))}
      {accent ? (
        <span className="inline-block overflow-hidden align-bottom pb-[0.08em]">
          <span data-word className={accentClassName}>
            {accent}
          </span>
        </span>
      ) : null}
    </Tag>
  );
}

/** Horizontal rule that draws itself in on scroll. */
export function DrawLine({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced()) {
      gsap.set(el, { scaleX: 1 });
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    gsap.set(el, { scaleX: 0, transformOrigin: "left center" });
    const tween = gsap.to(el, {
      scaleX: 1,
      duration: 1.4,
      ease: "power3.inOut",
      scrollTrigger: { trigger: el, start: "top 92%", once: true },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  return <div ref={ref} className={`h-px bg-white/10 ${className}`} />;
}
