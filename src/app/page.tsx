import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Brain,
  Check,
  CircleAlert,
  Gauge,
  Layers,
  LineChart,
  Lock,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { describeMarketData } from "@/lib/market-data";
import { Badge, DemoBadge, LinkButton } from "@/components/ui";
import { DISCLAIMER_LONG } from "@/lib/constants";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardedAt ? "/app" : "/onboarding");

  const data = describeMarketData();

  return (
    <div className="min-h-screen">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-accent-ink">
              T
            </span>
            <span className="text-[13px] font-semibold tracking-[0.08em]">
              TRADIA <span className="text-accent">AI</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-[12.5px] text-ink-3 md:flex">
            <a href="#product" className="hover:text-ink">Product</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
            <a href="#trust" className="hover:text-ink">Trust</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="px-2 py-1.5 text-[12.5px] text-ink-2 hover:text-ink">
              Sign in
            </Link>
            <LinkButton href="/register" variant="primary" size="sm">
              Start free
            </LinkButton>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-hairline">
        <div className="pointer-events-none absolute inset-0 grid-texture opacity-60" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[46rem] -translate-x-1/2 rounded-full bg-accent/[0.055] blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-14 sm:pt-20">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" dot>AI trading intelligence</Badge>
            {data.source === "demo" && <DemoBadge source="demo" />}
          </div>

          <h1 className="mt-5 max-w-3xl text-[32px] font-semibold leading-[1.12] tracking-[-0.028em] sm:text-[46px]">
            Understand the market before
            <br className="hidden sm:block" /> you risk anything on it.
          </h1>

          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-2 sm:text-[15px]">
            TRADIA AI is an AI trading analyst, scanner and risk desk in one workspace. It reads
            market structure across seven timeframes, explains why a setup exists, tells you where it
            is invalidated, and sizes the position so a wrong call stays survivable.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <LinkButton href="/register" variant="primary" size="lg">
              Create free account
              <ArrowRight className="size-4" strokeWidth={2} />
            </LinkButton>
            <LinkButton href="/login" variant="outline" size="lg">
              Sign in
            </LinkButton>
            <span className="ml-1 text-[11px] text-ink-4">No card required · Demo data labelled throughout</span>
          </div>

          {/* Product preview strip */}
          <div className="mt-11 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Brain,
                title: "AI Analyst",
                copy: "Trend, structure, regime and momentum across 1m–1W, with a bias you can interrogate.",
              },
              {
                icon: Radar,
                title: "Market Scanner",
                copy: "Ranks every instrument in your universe by real confluence — not by who shouts loudest.",
              },
              {
                icon: ShieldCheck,
                title: "Risk Manager",
                copy: "Position size, dollar risk, R multiple and portfolio heat computed before you click.",
              },
              {
                icon: LineChart,
                title: "Charts with AI levels",
                copy: "Every setup's entry zone, stop and target drawn on the chart it came from.",
              },
            ].map((f) => (
              <div key={f.title} className="panel-flat p-3.5">
                <f.icon className="size-4 text-accent" strokeWidth={1.9} />
                <h3 className="mt-2.5 text-[12.5px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{f.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The loop ────────────────────────────────────────── */}
      <section id="how" className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="eyebrow">The complete loop</div>
          <h2 className="mt-2 max-w-2xl text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
            Market data → AI analysis → opportunity → risk → your decision
          </h2>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-2">
            Most trading tools stop at a chart and a buy button. TRADIA AI carries the thought through:
            what the market is doing, what would make it interesting, where the idea breaks, how much it
            costs to be wrong, and what your own history says about your execution.
          </p>

          <ol className="mt-8 grid gap-3 md:grid-cols-5">
            {[
              { n: "01", title: "Read the market", body: "Regime, structure, volatility, volume and levels — computed, not described." },
              { n: "02", title: "Find the setup", body: "Confluence across timeframes, with an entry zone and a defined stop." },
              { n: "03", title: "Size the risk", body: "Dollar risk, position size, R multiple and portfolio heat before entry." },
              { n: "04", title: "Decide", body: "Paper trade it or skip it. Both are decisions the product respects." },
              { n: "05", title: "Improve", body: "Journal the outcome; the AI tells you where your execution leaks." },
            ].map((s) => (
              <li key={s.n} className="panel-flat p-3.5">
                <div className="tnum text-[10.5px] font-semibold text-accent">{s.n}</div>
                <div className="mt-1.5 text-[12.5px] font-semibold text-ink">{s.title}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Product areas ───────────────────────────────────── */}
      <section id="product" className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <div className="eyebrow">Built for decisions</div>
              <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
                An analyst that shows its work
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                Every AI output in TRADIA AI carries its evidence: the asset, timeframe, data
                timestamp, the contributing factors, the confidence estimate, the risk, and the
                exact conditions that would invalidate it.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  "Multi-timeframe bias with an explanation, not a coloured arrow",
                  "Setups with entry zones, stops, targets and computed R multiples",
                  "Explicit invalidation: what would prove the idea wrong",
                  "A hard line between paper and live performance",
                  "Journal analysis that refuses to generalise from 3 trades",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-bull" strokeWidth={2.4} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <span className="text-[11.5px] font-medium text-ink">Sample AI setup</span>
                <Badge tone="accent">Illustrative</Badge>
              </div>
              <div className="space-y-3 p-3.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold">BTC/USD · LONG</span>
                  <span className="text-[10.5px] text-ink-3">4H · Demo data</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  {[
                    { l: "Entry zone", v: "66,900 – 67,340" },
                    { l: "Stop loss", v: "65,480" },
                    { l: "Target", v: "73,900" },
                  ].map((x) => (
                    <div key={x.l} className="rounded-[6px] border border-hairline-2 bg-surface-2 px-2 py-1.5">
                      <div className="text-[9.5px] uppercase tracking-[0.07em] text-ink-4">{x.l}</div>
                      <div className="tnum mt-0.5 text-[11.5px] text-ink">{x.v}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 text-[11px] leading-relaxed">
                  <p className="text-ink-2">
                    <span className="text-ink">Why:</span> structure is printing higher highs and higher
                    lows, momentum is positive on the 4H, volume expanded on the last breakout, and
                    price is pulling back into the 20/50 EMA confluence.
                  </p>
                  <p className="text-ink-2">
                    <span className="text-ink">Invalidated if:</span> a 4H close below 65,480, or structure
                    flips to lower highs before the entry zone fills.
                  </p>
                  <p className="text-ink-3">
                    AI-estimated confidence 71/100 · R/R 2.9:1 · Based on available market data.
                  </p>
                </div>
              </div>
              <div className="border-t border-hairline px-3.5 py-2 text-[10px] text-ink-4">
                Illustrative sample only. Confidence is not a probability of profit.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="eyebrow">Plans</div>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
            Free covers the whole loop. Pro removes the ceiling.
          </h2>
          <div className="mt-7 grid gap-3 md:grid-cols-2 lg:max-w-3xl">
            <div className="panel p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold">Free</h3>
                <span className="tnum text-[20px] font-semibold">$0</span>
              </div>
              <p className="mt-1 text-[11.5px] text-ink-3">For getting the process right.</p>
              <ul className="mt-3.5 space-y-2 text-[12px] text-ink-2">
                {[
                  "8 AI analyses per day",
                  "4 timeframes per analysis",
                  "5 scanner runs per day, 6 ranked results",
                  "Unlimited risk calculations",
                  "12 open paper positions",
                  "Basic journal analytics",
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-ink-4" strokeWidth={2.2} />
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton href="/register" variant="outline" size="md" className="mt-4 w-full">
                Start free
              </LinkButton>
            </div>

            <div className="panel relative overflow-hidden border-[#d9a44133] p-4">
              <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-accent/[0.07] blur-2xl" />
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[14px] font-semibold">
                  Pro <Sparkles className="size-3.5 text-accent" strokeWidth={2} />
                </h3>
                <span className="tnum text-[20px] font-semibold">
                  $29<span className="text-[11px] font-normal text-ink-3">/mo</span>
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-ink-3">For traders running this as a process.</p>
              <ul className="mt-3.5 space-y-2 text-[12px] text-ink-2">
                {[
                  "Unlimited AI analyses & scanner runs",
                  "Full 7-timeframe analysis",
                  "Advanced multi-scenario forecasting",
                  "Full scanner universe (15 ranked)",
                  "AI journal analytics & strategy breakdown",
                  "Advanced portfolio analytics",
                  "Up to 50 alerts",
                  "Unlimited paper positions",
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={2.2} />
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton href="/register" variant="primary" size="md" className="mt-4 w-full">
                Start free, upgrade anytime
              </LinkButton>
            </div>
          </div>
          <p className="mt-3 text-[10.5px] text-ink-4">
            Paid plans are not enabled in this build — upgrading is a demo flow that flips entitlements
            locally so the Pro experience can be evaluated.
          </p>
        </div>
      </section>

      {/* ── Trust ───────────────────────────────────────────── */}
      <section id="trust" className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: CircleAlert, title: "No guarantees", body: "No product surface claims certainty, accuracy or guaranteed profit — by design and by review." },
              { icon: Layers, title: "Data-source honesty", body: "Simulated prices are labelled DEMO DATA on every screen that shows them, with timestamps." },
              { icon: Gauge, title: "Risk before reward", body: "Position sizing, invalidation and portfolio heat are first-class features, not disclaimers." },
              { icon: Lock, title: "Your data stays yours", body: "Server-side sessions, hashed credentials, and analysis that runs against your own journal only." },
            ].map((t) => (
              <div key={t.title} className="panel-flat p-3.5">
                <t.icon className="size-4 text-ink-2" strokeWidth={1.8} />
                <h3 className="mt-2.5 text-[12.5px] font-semibold">{t.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{t.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-[10px] border border-hairline-2 bg-surface p-4">
            <h3 className="text-[12px] font-semibold text-ink">What TRADIA AI is not</h3>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
              It is not a signal service, a broker, or a promise. It does not place trades, hold funds, or
              tell you what you must do. It is an analysis and discipline tool: it shows you the evidence
              and the risk, and you make the decision.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <h2 className="mx-auto max-w-xl text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
            Open your AI trading workspace
          </h2>
          <p className="mx-auto mt-2.5 max-w-md text-[12.5px] leading-relaxed text-ink-2">
            Two minutes to set up your markets, style and risk defaults. Then analyse your first
            instrument.
          </p>
          <div className="mt-6 flex justify-center gap-2.5">
            <LinkButton href="/register" variant="primary" size="lg">
              Create account
            </LinkButton>
            <LinkButton href="/login" variant="outline" size="lg">
              Sign in
            </LinkButton>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-[10.5px] leading-relaxed text-ink-4">{DISCLAIMER_LONG}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-[10.5px] text-ink-4">
          <span>© {new Date().getFullYear()} TRADIA AI</span>
          <Link href="/legal/terms" className="hover:text-ink-3">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-ink-3">Privacy</Link>
          <Link href="/legal/risk" className="hover:text-ink-3">Risk disclosure</Link>
          <span className="ml-auto">
            Data feed: {data.label} · {data.source === "demo" ? "simulated" : "live"}
          </span>
        </div>
      </footer>
    </div>
  );
}
