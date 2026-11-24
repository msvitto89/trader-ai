"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BrandMarquee } from "./BrandMarquee";
import { ArmillarySphere } from "./ArmillarySphere";
import { SolarField } from "./SolarField";
import { KineticText } from "./KineticText";
import { FadeInUp } from "./reveal";
import { Magnetic } from "./interactive";

/**
 * Hero composition.
 *
 * Layered like a print piece rather than a web banner:
 *   1. solar field   generative particle artwork, pointer-aware
 *   2. sun chrome    a warm arc rising behind the type (the "solar" motif)
 *   3. 3D object     wireframe icosahedron, parallaxed
 *   4. grain         film noise to stop the gradients banding
 *   5. type          kinetic letters, pointer-reactive
 *
 * Everything below the fold is untouched; this is the only section that is
 * allowed to be an artwork, and the product itself stays restrained.
 */
export function Hero() {
  const sunRef = useRef<HTMLDivElement | null>(null);
  const objectWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        // The sun drifts up and the object recedes as the hero leaves.
        if (sunRef.current) {
          sunRef.current.style.transform = `translate3d(-50%, ${(y * 0.16).toFixed(1)}px, 0) scale(${(1 + y * 0.00012).toFixed(4)})`;
        }
        if (objectWrapRef.current) {
          objectWrapRef.current.style.transform = `translate3d(0, ${(y * -0.1).toFixed(1)}px, 0)`;
          objectWrapRef.current.style.opacity = String(
            Math.max(0, 1 - y / 900),
          );
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
      {/* 1 — generative solar field */}
      <div className="pointer-events-none absolute inset-0 -z-20">
        <SolarField density={0.00011} />
      </div>

      {/* 2 — sun chrome: a warm arc behind the headline */}
      <div
        ref={sunRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[42%] -z-10 size-[46rem] -translate-x-1/2 -translate-y-1/2 will-change-transform"
      >
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(217,164,65,0.16),rgba(217,164,65,0.05)_38%,transparent_66%)] blur-[60px]" />
        {/* Ruled rings, like an ephemeris diagram */}
        <div className="absolute inset-[14%] rounded-full border border-accent/[0.09]" />
        <div className="absolute inset-[26%] rounded-full border border-accent/[0.07]" />
        <div className="absolute inset-[38%] rounded-full border border-accent/[0.05]" />
        {/* Horizon line the sun sits on */}
        <div className="absolute inset-x-[-30%] top-1/2 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
      </div>

      {/* 3 — armillary sphere, receding on scroll */}
      <div ref={objectWrapRef} className="pointer-events-none absolute inset-0 -z-10 will-change-transform">
        <ArmillarySphere />
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

      <div className="pointer-events-none absolute inset-0 -z-[4] bg-[radial-gradient(ellipse_60%_46%_at_50%_52%,rgba(6,6,7,0.55)_0%,rgba(6,6,7,0.24)_54%,transparent_76%)]" />
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
          reach={230}
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
          <BrandMarquee />
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
