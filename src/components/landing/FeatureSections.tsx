"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Circle,
  Mic,
  Play,
  Sparkles,
  Volume2,
} from "lucide-react";
import { FadeInUp } from "./reveal";
import { CountUp, SpotlightCard, TiltCard } from "./interactive";

function VideoBackdrop({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Autoplay is only allowed while muted; keep it muted and nudge play() for
    // browsers that ignore the attribute (iOS low-power mode).
    el.muted = true;
    el.play().catch(() => {
      /* poster/black backdrop is fine */
    });
  }, []);

  return (
    <video
      ref={ref}
      className="absolute inset-0 size-full object-cover opacity-70"
      src={src}
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      aria-hidden
    />
  );
}

function Badge({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "bull" }) {
  const color = tone === "bull" ? "text-emerald-400/90" : "text-accent";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${color} backdrop-blur-sm`}
    >
      <Sparkles className="size-3" />
      {children}
    </span>
  );
}

function CtaPair() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <Link
        href="/register"
        className="rounded-full bg-white px-6 py-3 text-[13px] font-semibold text-black transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]"
      >
        Get started
      </Link>
      <Link
        href="/login"
        className="rounded-full border border-white/10 bg-[#1F1F22] px-6 py-3 text-[13px] font-semibold text-white transition-colors hover:border-white/20 hover:bg-[#2A2A2D]"
      >
        Sign in
      </Link>
    </div>
  );
}

/* ── Product showcase: a live-looking analysis panel ─────────────── */

const TIMEFRAMES = [
  { label: "1H", bias: "Bullish", strength: 72 },
  { label: "4H", bias: "Bullish", strength: 84 },
  { label: "1D", bias: "Neutral", strength: 41 },
  { label: "1W", bias: "Bullish", strength: 66 },
];

export function ProductShowcase() {
  const [active, setActive] = useState(1);

  useEffect(() => {
    const id = window.setInterval(
      () => setActive((v) => (v + 1) % TIMEFRAMES.length),
      2600,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <section id="product" className="relative px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <FadeInUp className="mx-auto mb-14 max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            The analyst
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Every output shows its work.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-400">
            A bias with an explanation. A setup with a stop and an entry zone.
            An invalidation condition you can act on. Nothing arrives as a bare
            arrow.
          </p>
        </FadeInUp>

        <FadeInUp delay={0.1}>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0c0d10]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              {/* Left: the analysis */}
              <div className="border-b border-white/[0.06] p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[15px] font-semibold text-white">
                      BTC/USD
                    </span>
                    <span className="rounded-[4px] border border-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      Demo data
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-gray-500">
                    24 Nov · 14:32 UTC
                  </span>
                </div>

                <div className="mt-6">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Overall bias
                  </p>
                  <div className="mt-2 flex items-end gap-3">
                    <span className="text-3xl font-semibold tracking-tight text-emerald-400">
                      Bullish
                    </span>
                    <span className="pb-1 font-mono text-[12px] text-gray-500">
                      +34 / 100
                    </span>
                  </div>
                  <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-gray-400">
                    Higher highs and higher lows on the 4H and 1D, with price
                    holding above the 50 EMA. Momentum is positive but not
                    extended; volume confirmed the last breakout. The 1D is
                    neutral, so this is a trend continuation, not a fresh regime.
                  </p>
                </div>

                {/* Timeframe matrix */}
                <div className="mt-7 space-y-1.5">
                  {TIMEFRAMES.map((tf, index) => (
                    <div
                      key={tf.label}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-500 ${
                        active === index
                          ? "border-accent/25 bg-accent/[0.05]"
                          : "border-white/[0.05] bg-white/[0.015]"
                      }`}
                    >
                      <span className="w-7 font-mono text-[11px] text-gray-400">
                        {tf.label}
                      </span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                            tf.bias === "Bullish"
                              ? "bg-emerald-400/80"
                              : "bg-gray-500/60"
                          }`}
                          style={{ width: `${tf.strength}%` }}
                        />
                      </div>
                      <span
                        className={`w-16 text-right text-[11.5px] font-medium ${
                          tf.bias === "Bullish"
                            ? "text-emerald-400/90"
                            : "text-gray-400"
                        }`}
                      >
                        {tf.bias}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: the setup */}
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Potential setup
                  </span>
                  <span className="rounded-[4px] border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                    Medium
                  </span>
                </div>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-white">
                    LONG
                  </span>
                  <span className="text-[12px] text-gray-500">· 4H · swing</span>
                </div>

                <dl className="mt-5 space-y-2.5">
                  {[
                    { k: "Entry zone", v: "66,900 – 67,340" },
                    { k: "Stop loss", v: "65,480" },
                    { k: "Take profit", v: "73,900" },
                    { k: "Risk / reward", v: "2.8 : 1" },
                    { k: "Confidence", v: "71 / 100 est." },
                  ].map((row) => (
                    <div
                      key={row.k}
                      className="flex items-center justify-between border-b border-white/[0.05] pb-2.5 last:border-0"
                    >
                      <dt className="text-[12px] text-gray-500">{row.k}</dt>
                      <dd className="font-mono text-[12.5px] text-white">
                        {row.v}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Invalidated if
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-gray-400">
                    a 4H close below 65,480, or structure flips to lower highs
                    before the entry zone fills.
                  </p>
                </div>

                <p className="mt-4 text-[10.5px] leading-relaxed text-gray-600">
                  Illustrative sample. Confidence is a confluence estimate, not a
                  probability of profit.
                </p>
              </div>
            </div>
          </div>
        </FadeInUp>
      </div>
    </section>
  );
}

/* ── Feature 1: risk desk ────────────────────────────────────────── */

export function FeatureRisk() {
  return (
    <section id="how" className="relative px-6 py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
        <FadeInUp>
          <Badge>Risk first</Badge>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Size the position before you feel the trade.
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-gray-400">
            Dollar risk, position size, R multiple, break-even win rate and
            portfolio heat — computed from your balance and the setup&apos;s own
            stop. A wrong call should be survivable by construction, not by luck.
          </p>
          <CtaPair />
        </FadeInUp>

        <FadeInUp delay={0.12}>
          <div className="relative aspect-[4/3.4] overflow-hidden rounded-3xl border border-white/10 p-8">
            <VideoBackdrop src="https://cdn.sceneai.art/Hero%20Section%20Video/1bcc8fa3-37f6-4c53-8591-0347e4c7f8ac.mp4" />
            <div className="absolute inset-0 bg-black/45" />

            <div className="relative flex h-full items-center">
              <div className="w-full rounded-2xl border border-white/10 bg-[#1C1C1E]/90 p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Position size
                  </span>
                  <span className="rounded-[4px] bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                    Valid
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { k: "Balance", v: "$25,000" },
                    { k: "Risk", v: "1.0%" },
                    { k: "Stop", v: "2.8%" },
                  ].map((cell) => (
                    <div
                      key={cell.k}
                      className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2"
                    >
                      <p className="text-[9.5px] uppercase tracking-wide text-gray-500">
                        {cell.k}
                      </p>
                      <p className="mt-0.5 font-mono text-[12.5px] text-white">
                        {cell.v}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-gray-500">
                      Position size
                    </span>
                    <span className="font-mono text-lg text-white">
                      3.54 oz
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between border-t border-white/[0.06] pt-2.5">
                    <span className="text-[12px] text-gray-500">
                      Max loss / target
                    </span>
                    <span className="font-mono text-[12.5px]">
                      <span className="text-rose-400">−$250</span>
                      <span className="text-gray-600"> / </span>
                      <span className="text-emerald-400">+$700</span>
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
                  <Circle className="size-2 fill-emerald-400 text-emerald-400" />
                  Portfolio heat after entry: 2.3%
                </div>
              </div>
            </div>
          </div>
        </FadeInUp>
      </div>
    </section>
  );
}

/* ── Feature 2: journal intelligence ─────────────────────────────── */

const WAVE = [10, 22, 34, 18, 42, 28, 48, 30, 16, 38, 24, 44, 20, 32, 12, 26, 40, 14];

export function FeatureJournal() {
  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
        <FadeInUp className="lg:order-1">
          <div className="relative aspect-[4/3.4] overflow-hidden rounded-3xl border border-white/10 p-8">
            <VideoBackdrop src="https://cdn.sceneai.art/Hero%20Section%20Video/736fd4a0-70ac-4f44-9633-55769ead6aca.mp4" />
            <div className="absolute inset-0 bg-black/45" />

            <div className="relative flex h-full items-center">
              <div className="w-full rounded-2xl border border-white/10 bg-[#1C1C1E]/90 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-white text-black">
                    <Play className="size-3.5 fill-black" />
                  </span>
                  <div>
                    <p className="text-[12.5px] font-medium text-white">
                      11:06 AM — your review
                    </p>
                    <p className="text-[10.5px] text-gray-500">
                      31 trades · last 90 days
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex h-10 items-center gap-[3px]">
                  {WAVE.map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-full bg-gradient-to-t from-accent/30 to-accent/80"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>

                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3.5">
                  <p className="text-[12px] leading-relaxed text-gray-300">
                    <span className="text-white">Your edge is swing.</span>{" "}
                    Across 14 trades you average 2.04R; scalping is −1.21R over 9.
                    The gap is preparation, not skill.
                  </p>
                  <p className="text-[11px] leading-relaxed text-gray-500">
                    Losses cluster within 10 minutes of the open, which suggests
                    entries taken before structure confirms.
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-2 text-[10.5px] text-gray-600">
                  <Volume2 className="size-3" />
                  Journal analysis needs 8 trades to generalise · n = 31
                </div>
              </div>
            </div>
          </div>
        </FadeInUp>

        <FadeInUp delay={0.12} className="lg:order-2">
          <Badge tone="bull">Journal intelligence</Badge>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Learn from your own execution, not someone else&apos;s opinion.
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-gray-400">
            Log the trade, the setup and the outcome. The AI reads your history
            and tells you where the leak is — which style carries your edge,
            whether you cut winners early, when you take your worst entries. It
            refuses to draw conclusions from too little data.
          </p>
          <CtaPair />
        </FadeInUp>
      </div>
    </section>
  );
}

/* ── Trust strip ─────────────────────────────────────────────────── */

const TRUST = [
  {
    title: "No guarantees",
    body: "No surface claims certainty, accuracy or guaranteed profit — by design and by review.",
  },
  {
    title: "Data-source honesty",
    body: "Simulated prices are badged DEMO DATA on every screen, with timestamps attached.",
  },
  {
    title: "Risk before reward",
    body: "Position sizing, invalidation and portfolio heat are first-class features, not footnotes.",
  },
  {
    title: "Paper stays paper",
    body: "Virtual results are never blended into real performance. The line is structural.",
  },
];

export function TrustStrip() {
  return (
    <section id="trust" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <FadeInUp className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Trust
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Built to be disagreeable with.
          </h2>
        </FadeInUp>

        <FadeInUp delay={0.1} stagger={0.08} className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((item) => (
            <SpotlightCard key={item.title} className="bg-[#0a0b0d] p-6">
              <p className="text-[13px] font-semibold text-white">
                {item.title}
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-gray-400">
                {item.body}
              </p>
            </SpotlightCard>
          ))}
        </FadeInUp>

        <FadeInUp delay={0.16} className="mt-10">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.015] px-5 py-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              What this is not
            </span>
            <p className="max-w-3xl text-[12.5px] leading-relaxed text-gray-400">
              Not a signal service, a broker, or a promise. It does not place
              trades, hold funds, or tell you what you must do. It shows the
              evidence and the risk; you make the decision.
            </p>
            <Link
              href="/legal/risk"
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-gray-300 transition-colors hover:text-white"
            >
              Risk disclosure
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </FadeInUp>
      </div>
    </section>
  );
}

/* ── Pricing ─────────────────────────────────────────────────────── */

const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "For getting the process right.",
    features: [
      "8 AI analyses per day",
      "4 timeframes per analysis",
      "5 scanner runs per day",
      "Unlimited risk calculations",
      "12 open paper positions",
    ],
    cta: "Start free",
    href: "/register",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$29",
    note: "For traders running this as a process.",
    features: [
      "Unlimited AI analyses & scans",
      "Full 7-timeframe analysis",
      "Advanced scenario forecasting",
      "Full scanner universe",
      "AI journal & portfolio analytics",
      "Up to 50 alerts",
    ],
    cta: "Start free, upgrade anytime",
    href: "/register",
    highlight: true,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <FadeInUp className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Free covers the whole loop.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-400">
            Pro raises the ceiling rather than unlocking the point of the
            product.
          </p>
        </FadeInUp>

        <FadeInUp delay={0.1} stagger={0.1} className="mt-14 grid gap-4 md:grid-cols-2">
          {PLANS.map((plan) => (
            <TiltCard key={plan.name} max={4}>
            <SpotlightCard
              className={`h-full rounded-2xl border p-7 ${
                plan.highlight
                  ? "border-accent/25 bg-[linear-gradient(180deg,rgba(217,164,65,0.06),rgba(255,255,255,0.01))]"
                  : "border-white/10 bg-white/[0.015]"
              }`}
            >
              {plan.highlight && (
                <span className="absolute right-5 top-5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  Most used
                </span>
              )}
              <p className="text-[13px] font-semibold text-white">{plan.name}</p>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight text-white">
                  {plan.price}
                </span>
                <span className="text-[12.5px] text-gray-500">/mo</span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-gray-400">{plan.note}</p>

              <ul className="mt-6 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-[12.5px] text-gray-300">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent/70" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`mt-7 flex w-full items-center justify-center rounded-full px-5 py-3 text-[13px] font-semibold transition-transform duration-200 hover:scale-[1.01] ${
                  plan.highlight
                    ? "bg-white text-black"
                    : "border border-white/10 bg-[#1F1F22] text-white hover:bg-[#2A2A2D]"
                }`}
              >
                {plan.cta}
              </Link>
            </SpotlightCard>
            </TiltCard>
          ))}
        </FadeInUp>

        <p className="mt-6 text-center text-[11.5px] text-gray-600">
          Paid plans are not enabled in this build — upgrading is a demo flow
          that flips entitlements locally so the Pro experience can be evaluated.
        </p>
      </div>
    </section>
  );
}

/** Decorative mic icon kept for the chat mockup's input row. */
export function MicGlyph({ className = "size-3.5" }: { className?: string }) {
  return <Mic className={className} />;
}

/* ── Metrics band ────────────────────────────────────────────────── */

const METRICS = [
  { value: 7, suffix: "", label: "Timeframes analysed per instrument", decimals: 0 },
  { value: 15, suffix: "", label: "Instruments ranked by the scanner", decimals: 0 },
  { value: 6, suffix: "", label: "Independent engines in the pipeline", decimals: 0 },
  { value: 100, suffix: "%", label: "Setups carrying a stop and invalidation", decimals: 0 },
];

export function MetricsBand() {
  return (
    <section className="border-y border-white/[0.05] px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <FadeInUp
          stagger={0.09}
          className="grid grid-cols-2 gap-y-10 sm:grid-cols-4 sm:gap-x-6"
        >
          {METRICS.map((metric) => (
            <div key={metric.label} className="text-center sm:text-left">
              <p className="font-mono text-3xl font-medium tracking-tight text-white sm:text-4xl">
                <CountUp
                  to={metric.value}
                  suffix={metric.suffix}
                  decimals={metric.decimals}
                />
              </p>
              <p className="mx-auto mt-2 max-w-[180px] text-[11.5px] leading-relaxed text-gray-500 sm:mx-0">
                {metric.label}
              </p>
            </div>
          ))}
        </FadeInUp>
      </div>
    </section>
  );
}
