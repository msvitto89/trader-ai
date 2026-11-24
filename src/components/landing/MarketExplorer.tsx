"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { FadeInUp } from "./reveal";

/**
 * Interactive market explorer.
 *
 * The centrepiece of the page: a visitor picks an instrument and the *real*
 * engine runs — same analyseBundle, same demo feed the product uses. Nothing
 * here is a screenshot, which is the honest way to demo an analysis product.
 *
 * Timeframe matrix bars animate between runs, so switching instrument reads as
 * a recomputation rather than a page swap.
 */

interface DemoSetup {
  direction: "long" | "short";
  timeframe: string;
  quality: string;
  entryLow: number;
  entryHigh: number;
  stop: number;
  takeProfit: number;
  riskReward: number;
  confidence: number;
  rationale: string[];
  invalidatedIf: string[];
}

interface DemoAnalysis {
  symbol: string;
  source: "live" | "demo";
  generatedAt: number;
  price: number;
  overallBias: string;
  biasScore: number;
  regimeLabel: string;
  summary: string;
  structureNotes: string;
  keyLevelNote: string;
  timeframes: { timeframe: string; bias: string; score: number }[];
  setup: DemoSetup | null;
  setupsFound: number;
}

const INSTRUMENTS = [
  { symbol: "BTC/USD", label: "Bitcoin", klass: "Crypto" },
  { symbol: "ETH/USD", label: "Ethereum", klass: "Crypto" },
  { symbol: "XAU/USD", label: "Gold", klass: "Commodity" },
  { symbol: "EUR/USD", label: "Euro", klass: "Forex" },
  { symbol: "AAPL", label: "Apple", klass: "Equity" },
  { symbol: "NASDAQ", label: "Nasdaq 100", klass: "Index" },
  { symbol: "S&P 500", label: "S&P 500", klass: "Index" },
];

const STYLES = [
  { id: "scalping", label: "Scalping" },
  { id: "day", label: "Day" },
  { id: "swing", label: "Swing" },
  { id: "longterm", label: "Long term" },
] as const;

function fmtPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function biasColor(bias: string): string {
  if (bias === "bullish") return "text-emerald-400";
  if (bias === "bearish") return "text-rose-400";
  return "text-gray-400";
}

function biasBar(bias: string): string {
  if (bias === "bullish") return "bg-emerald-400/75";
  if (bias === "bearish") return "bg-rose-400/75";
  return "bg-gray-500/55";
}

export function MarketExplorer() {
  const [symbol, setSymbol] = useState("BTC/USD");
  const [style, setStyle] = useState<(typeof STYLES)[number]["id"]>("swing");
  const [data, setData] = useState<DemoAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const run = useCallback(
    async (nextSymbol: string, nextStyle: string) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/demo/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ symbol: nextSymbol, style: nextStyle }),
        });
        if (!response.ok) throw new Error("Analysis unavailable");
        const payload = (await response.json()) as DemoAnalysis;
        // Ignore stale responses when the user clicks quickly.
        if (id === requestId.current) setData(payload);
      } catch {
        if (id === requestId.current) setError("Could not run the analysis. Try again.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void run(symbol, style);
  }, [symbol, style, run]);

  const matrix = useMemo(() => {
    if (!data) return [];
    return data.timeframes.map((tf) => ({
      ...tf,
      // Map -100..100 into a centred bar width so direction is visible.
      width: Math.min(100, Math.max(8, Math.abs(tf.score))),
    }));
  }, [data]);

  return (
    <section id="explore" className="relative px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <FadeInUp className="mx-auto mb-12 max-w-2xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            <Sparkles className="size-3" />
            Try it now
          </p>
          <h2 className="mt-5 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Pick an instrument. Watch the engine think.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-400">
            This is the live analysis engine, not a screenshot. Same market data
            layer, same scoring, same invalidation rules you get after signing in.
          </p>
        </FadeInUp>

        {/* Instrument chips */}
        <FadeInUp delay={0.08}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {INSTRUMENTS.map((item) => {
              const active = item.symbol === symbol;
              return (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => setSymbol(item.symbol)}
                  aria-pressed={active}
                  className={`group relative overflow-hidden rounded-full border px-4 py-2 text-[12.5px] font-medium transition-all duration-300 ${
                    active
                      ? "border-accent/40 bg-accent/[0.1] text-white"
                      : "border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {item.label}
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">
                      {item.klass}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </FadeInUp>

        {/* Style switcher */}
        <FadeInUp delay={0.12}>
          <div className="mt-4 flex items-center justify-center gap-1">
            {STYLES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStyle(item.id)}
                aria-pressed={style === item.id}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                  style === item.id
                    ? "bg-white text-black"
                    : "text-gray-500 hover:text-gray-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </FadeInUp>

        {/* Result panel */}
        <FadeInUp delay={0.16}>
          <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[#0b0c0f]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

            {error && (
              <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
                <p className="text-[12.5px] text-rose-300">{error}</p>
                <button
                  type="button"
                  onClick={() => run(symbol, style)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] text-gray-300 hover:text-white"
                >
                  <RefreshCw className="size-3" /> Retry
                </button>
              </div>
            )}

            <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
              {/* Left: bias + matrix */}
              <div className="border-b border-white/[0.06] p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[17px] font-semibold tracking-tight text-white">
                        {symbol}
                      </span>
                      {data && (
                        <span className="rounded-[4px] border border-white/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                          {data.source === "demo" ? "Demo data" : "Live"}
                        </span>
                      )}
                    </div>
                    {data && (
                      <p className="mt-1 font-mono text-[11px] text-gray-500">
                        {fmtPrice(data.price)} · {data.regimeLabel} ·{" "}
                        {new Date(data.generatedAt).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        UTC
                      </p>
                    )}
                  </div>

                  {data && (
                    <div className="text-right">
                      <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                        Bias
                      </p>
                      <p
                        className={`text-[19px] font-semibold capitalize tracking-tight ${biasColor(data.overallBias)}`}
                      >
                        {data.overallBias}
                      </p>
                      <p className="font-mono text-[10.5px] text-gray-600">
                        {data.biasScore > 0 ? "+" : ""}
                        {data.biasScore} / 100
                      </p>
                    </div>
                  )}
                </div>

                {/* Timeframe matrix */}
                <div className="mt-6">
                  <p className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Multi-timeframe
                  </p>
                  <div className="space-y-1.5">
                    {(loading && !matrix.length
                      ? Array.from({ length: 7 }, (_, i) => ({
                          timeframe: ["1m", "5m", "15m", "1h", "4h", "1d", "1w"][i],
                          bias: "neutral",
                          width: 0,
                          score: 0,
                        }))
                      : matrix
                    ).map((tf) => (
                      <div
                        key={tf.timeframe}
                        className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2"
                      >
                        <span className="w-7 font-mono text-[10.5px] uppercase text-gray-400">
                          {tf.timeframe}
                        </span>
                        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className={`h-full rounded-full transition-[width,background-color] duration-700 ease-out ${biasBar(tf.bias)}`}
                            style={{ width: `${tf.width}%` }}
                          />
                        </div>
                        <span
                          className={`w-[52px] text-right text-[10.5px] font-medium capitalize ${biasColor(tf.bias)}`}
                        >
                          {loading ? "—" : tf.bias}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {data && (
                  <p className="mt-5 text-[12px] leading-relaxed text-gray-400">
                    {data.summary}
                  </p>
                )}
              </div>

              {/* Right: setup */}
              <div className="relative p-6 sm:p-8">
                {loading && (
                  <div className="absolute right-6 top-6 flex items-center gap-1.5 text-[10.5px] text-gray-500">
                    <Loader2 className="size-3 animate-spin" />
                    analysing
                  </div>
                )}

                {data?.setup ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                        Potential setup
                      </span>
                      <span
                        className={`rounded-[4px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${
                          data.setup.quality === "high"
                            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-400"
                            : data.setup.quality === "medium"
                              ? "border-accent/25 bg-accent/10 text-accent"
                              : "border-white/15 bg-white/5 text-gray-400"
                        }`}
                      >
                        {data.setup.quality}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline gap-2">
                      <span
                        className={`text-[15px] font-semibold uppercase ${
                          data.setup.direction === "long"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {data.setup.direction}
                      </span>
                      <span className="text-[11.5px] text-gray-500">
                        · {data.setup.timeframe} · {style}
                      </span>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-2">
                      {[
                        {
                          k: "Entry zone",
                          v: `${fmtPrice(data.setup.entryLow)} – ${fmtPrice(data.setup.entryHigh)}`,
                        },
                        { k: "Stop", v: fmtPrice(data.setup.stop) },
                        { k: "Target", v: fmtPrice(data.setup.takeProfit) },
                        { k: "R / R", v: `${data.setup.riskReward.toFixed(1)} : 1` },
                      ].map((row) => (
                        <div
                          key={row.k}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
                        >
                          <p className="text-[9px] uppercase tracking-wide text-gray-500">
                            {row.k}
                          </p>
                          <p className="mt-0.5 font-mono text-[11.5px] text-white">
                            {row.v}
                          </p>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-4">
                      <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                        Why this trade
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {data.setup.rationale.slice(0, 3).map((reason, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-[11.5px] leading-relaxed text-gray-400"
                          >
                            <span className="mt-[6px] size-1 shrink-0 rounded-full bg-accent/60" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-4 rounded-lg border border-rose-400/15 bg-rose-400/[0.04] px-3 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-rose-300/70">
                        Invalidated if
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                        {data.setup.invalidatedIf[0]}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3.5">
                      <span className="text-[10.5px] text-gray-500">
                        AI-estimated confidence{" "}
                        <span className="font-mono text-gray-300">
                          {data.setup.confidence}/100
                        </span>
                      </span>
                      <Link
                        href="/register"
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-white transition-colors hover:text-accent"
                      >
                        Full analysis
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                    <p className="text-[13px] font-medium text-gray-300">
                      No qualified setup
                    </p>
                    <p className="mt-2 max-w-[240px] text-[11.5px] leading-relaxed text-gray-500">
                      The engine found {data?.setupsFound ?? 0} setups for this
                      instrument on a {style} horizon. Standing aside is a valid
                      output — it will not invent a trade to fill the panel.
                    </p>
                    <button
                      type="button"
                      onClick={() => run(symbol, style)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-gray-300 hover:text-white"
                    >
                      <RefreshCw className="size-3" /> Re-run
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-3 text-[10px] text-gray-600">
              <span>
                Confidence is a confluence estimate, not a probability of profit.
              </span>
              <span>Analysis and education — never advice.</span>
            </div>
          </div>
        </FadeInUp>
      </div>
    </section>
  );
}
