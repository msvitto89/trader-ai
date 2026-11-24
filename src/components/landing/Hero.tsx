"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BrandMarquee } from "./BrandMarquee";
import { HeroObject } from "./HeroObject";
import { RevealWords, FadeInUp } from "./reveal";

export function Hero() {
  return (
    <section
      id="about"
      className="relative z-0 flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-32"
    >
      {/* 3D object sits behind the copy so the headline stays the focal point */}
      <HeroObject />

      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(255,255,255,0.045),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 bg-gradient-to-b from-transparent to-black" />

      <div className="relative flex w-full max-w-7xl flex-col items-center">
        <FadeInUp distance={24} duration={0.9}>
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] font-medium text-gray-300 backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-accent" />
            Market analysis, not market promises
          </span>
        </FadeInUp>

        <RevealWords
          text="Read the market"
          accent="before you risk anything."
          accentClassName="inline-block font-serif font-normal italic text-gray-300"
          delay={0.15}
          className="max-w-4xl text-center text-[40px] font-medium leading-[1.06] tracking-[-0.03em] text-white sm:text-6xl md:text-7xl"
        />

        <FadeInUp delay={0.5} distance={20}>
          <p className="mt-7 max-w-2xl text-center text-[16px] leading-relaxed text-gray-400">
            An AI trading analyst, scanner and risk desk in one workspace. It
            reads structure across seven timeframes, explains why a setup exists,
            says where it breaks — and sizes it so a wrong call stays survivable.
          </p>
        </FadeInUp>

        <FadeInUp delay={0.62} distance={20}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[13.5px] font-semibold text-black transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]"
            >
              Create free account
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-full border border-white/10 bg-[#1F1F22] px-6 py-3.5 text-[13.5px] font-semibold text-white transition-colors hover:border-white/20 hover:bg-[#2A2A2D]"
            >
              Sign in
            </Link>
          </div>
        </FadeInUp>

        <FadeInUp delay={0.74} distance={16}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11.5px] text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-gray-500" />
              No card required
            </span>
            <span className="text-gray-700">·</span>
            <span>Demo data labelled throughout</span>
            <span className="text-gray-700">·</span>
            <span>Paper trading only</span>
          </div>
        </FadeInUp>

        <FadeInUp delay={0.85} distance={20} className="w-full">
          <BrandMarquee />
        </FadeInUp>
      </div>
    </section>
  );
}
