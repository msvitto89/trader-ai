"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BrandMarquee } from "./BrandMarquee";
import { CandleField } from "./CandleField";
import { KineticText } from "./KineticText";
import { FadeInUp } from "./reveal";
import { Magnetic } from "./interactive";

/**
 * Hero composition.
 *
 * Layered like a print piece rather than a web banner:
 *   1. candle field  a live, generative candlestick chart that answers the
 *                    pointer with pops, RGB-split glitches and an OHLC readout
 *   2. grain         film noise to stop the gradients banding
 *   3. type          kinetic letters, pointer-reactive
 *
 * Everything below the fold is untouched; this is the only section that is
 * allowed to be an artwork, and the product itself stays restrained.
 */
export function Hero() {
  const objectWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        // The field recedes and dims as the hero leaves, so the next section
        // arrives over a clearing rather than over a busy chart.
        if (objectWrapRef.current) {
          objectWrapRef.current.style.transform = `translate3d(0, ${(y * -0.12).toFixed(1)}px, 0)`;
          objectWrapRef.current.style.opacity = String(Math.max(0, 1 - y / 820));
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      id="about"
      className="relative z-0 flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-32"
    >
      {/* 1 — interactive candle field: the artwork, and the subject */}
      <div
        ref={objectWrapRef}
        className="pointer-events-none absolute inset-0 -z-20 will-change-transform"
      >
        <CandleField />
      </div>

      {/* 4 — film grain: kills gradient banding on wide displays */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-[5] opacity-[0.16] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="pointer-events-none absolute inset-0 -z-[4] bg-[linear-gradient(to_bottom,rgba(6,6,7,0.72)_0%,rgba(6,6,7,0.26)_34%,rgba(6,6,7,0.30)_58%,rgba(6,6,7,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-[4] h-72 bg-gradient-to-b from-transparent via-black/60 to-black" />

      {/* 5 — type */}
      <div className="relative flex w-full max-w-7xl flex-col items-center">
        <FadeInUp distance={18} duration={0.9}>
          <span className="mb-9 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11.5px] font-medium text-gray-300 backdrop-blur-md">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
            </span>
            Market analysis, not market promises
          </span>
        </FadeInUp>

        <KineticText
          text="Read the market"
          delay={0.18}
          className="max-w-4xl text-center text-[42px] font-medium leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl md:text-[86px]"
        />

        <KineticText
          as="p"
          text="before you risk anything."
          delay={0.42}
          className="mt-1 max-w-4xl text-center font-serif text-[36px] font-normal italic leading-[1.05] tracking-[-0.02em] text-gray-300 sm:text-5xl md:text-[72px]"
        />

        <FadeInUp delay={0.85} distance={18}>
          <p className="mt-8 max-w-xl text-center text-[15px] leading-relaxed text-gray-400">
            An AI trading analyst, scanner and risk desk in one workspace. Seven
            timeframes, explained setups, and position sizing that keeps a wrong
            call survivable.
          </p>
        </FadeInUp>

        <FadeInUp delay={0.98} distance={18}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Magnetic strength={0.22}>
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[13.5px] font-semibold text-black shadow-[0_0_40px_-8px_rgba(217,164,65,0.45)] transition-shadow duration-300 hover:shadow-[0_0_60px_-6px_rgba(217,164,65,0.65)]"
              >
                Create free account
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Magnetic>
            <Magnetic strength={0.18}>
              <Link
                href="/login"
                className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-7 py-3.5 text-[13.5px] font-semibold text-white backdrop-blur-md transition-colors hover:border-white/25 hover:bg-white/[0.09]"
              >
                Sign in
              </Link>
            </Magnetic>
          </div>
        </FadeInUp>

        <FadeInUp delay={1.1} distance={14}>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11.5px] text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              No card required
            </span>
            <span className="text-gray-700">·</span>
            <span>Demo data labelled throughout</span>
            <span className="text-gray-700">·</span>
            <span>Paper trading only</span>
          </div>
        </FadeInUp>

        <FadeInUp delay={1.2} distance={18} className="w-full">
          <div className="hero-floor pt-10">
            <BrandMarquee />
          </div>
        </FadeInUp>
      </div>

      {/* Scroll cue */}
      <a
        href="#explore"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gray-600 transition-colors hover:text-gray-300 sm:flex"
      >
        Scroll
        <span className="relative h-9 w-px overflow-hidden bg-white/10">
          <span className="absolute inset-x-0 top-0 h-3 animate-[scrollCue_1.8s_ease-in-out_infinite] bg-accent" />
        </span>
      </a>
    </section>
  );
}
