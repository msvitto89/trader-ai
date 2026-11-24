"use client";

/**
 * AI Analyst workspace — the core product experience.
 *
 * Flow: select instrument → optional timeframe → "Analyze with AI" → market
 * overview, multi-timeframe matrix, bias, scenarios, setups with reasoning.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Brain,
  ChevronRight,
  CircleAlert,
  Clock,
  Lock,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Alert,
  Badge,
  BiasBadge,
  Button,
  DemoBadge,
  EmptyState,
  Modal,
  NumericInput,
  Panel,
  SectionHeading,
  Segmented,
  Skeleton,
  StatRow,
  useToast,
} from "@/components/ui";
import { SetupCard } from "./SetupCard";
import { PriceChart } from "@/components/chart/PriceChart";
import { fmtDateTime, fmtNum, fmtPrice } from "@/lib/format";
import { ASSET_CLASS_LABEL, INSTRUMENTS, getInstrument } from "@/lib/instruments";
import { STYLE_LABEL } from "@/lib/constants";
import { TIMEFRAMES, TIMEFRAME_LABEL, type AIAnalysis, type Candle, type Timeframe, type TradeSetup, type TradingStyle } from "@/lib/types";

interface AnalyzeResponse {
  analysis: AIAnalysis;
  entitlements: { timeframeDepth: number; plan: string };
  availableTimeframes: Timeframe[];
  hiddenTimeframes: Timeframe[];
}

interface SeriesResponse {
  candles: Candle[];
  indicators: { ema20: number; ema50: number };
  levels: { price: number; kind: "support" | "resistance"; strength: number; touches: number }[];
  source: "demo" | "live";
}

export function AnalystWorkspace() {
  const params = useSearchParams();
  const initialSymbol = params.get("symbol") ?? "";
  const { user, usage, toggleWatch, isWatched, refresh } = useSession();
  const { push: toast } = useToast();

  const [symbol, setSymbol] = useState(initialSymbol || user?.watchlist[0] || "BTC/USD");
  const [timeframe, setTimeframe] = useState<Timeframe | null>(null);
  const [style, setStyle] = useState<TradingStyle>(user?.preferences.style ?? "day");
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState<{ used: number; limit: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [series, setSeries] = useState<SeriesResponse | null>(null);
  const [setupModal, setSetupModal] = useState<TradeSetup | null>(null);
  const runId = useRef(0);

  // Unlocked timeframes come from the server (style-aware); before the first run
  // we show every timeframe so the chart selector is never artificially empty.
  const availableTfs = analysis ? analysis.timeframes.map((t) => t.timeframe) : TIMEFRAMES;
  const activeTf = timeframe && availableTfs.includes(timeframe) ? timeframe : null;

  /* ── Load chart series whenever the instrument or timeframe changes ── */
  useEffect(() => {
    let cancelled = false;
    setSeries(null);
    const tf = activeTf ?? "1h";
    api
      .get<SeriesResponse>(`/api/market/series?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}&limit=180`)
      .then((d) => {
        if (!cancelled) setSeries(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol, activeTf]);

  const runAnalysis = useCallback(
    async (opts?: { cached?: boolean }) => {
      const id = ++runId.current;
      setAnalysing(true);
      setError(null);
      setLimitReached(null);
      try {
        const res = await api.post<AnalyzeResponse>("/api/analyze", {
          symbol,
          timeframe: activeTf ?? undefined,
          style,
          cached: opts?.cached,
        });
        if (id !== runId.current) return;
        setAnalysis(res.analysis);
        void refresh();
      } catch (err) {
        if (id !== runId.current) return;
        if (err instanceof ApiRequestError) {
          if (err.code === "PLAN_LIMIT") {
            const d = err.details as { used?: number; limit?: number } | undefined;
            setLimitReached({ used: d?.used ?? 0, limit: d?.limit ?? 0 });
          } else {
            setError(err.message);
          }
        } else {
          setError("Analysis failed. Please try again.");
        }
      } finally {
        if (id === runId.current) setAnalysing(false);
      }
    },
    [symbol, activeTf, style, refresh],
  );

  /* ── Auto-run when arriving via ?symbol= (e.g. from scanner) ──────── */
  useEffect(() => {
    if (initialSymbol && !analysis) {
      void runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const instrument = getInstrument(symbol);
  const changeSymbol = (next: string) => {
    setSymbol(next);
    setAnalysis(null);
    setError(null);
  };
  const changeTimeframe = (tf: Timeframe | null) => {
    setTimeframe(tf);
    if (analysis && tf) void runAnalysis({ cached: false });
  };

  const lastCandles = useMemo(() => {
    if (!series) return undefined;
    const closes = series.candles.map((c) => c.c);
    const ema = (period: number) => {
      const out: number[] = new Array(closes.length).fill(NaN);
      if (closes.length < period) return out;
      const k = 2 / (period + 1);
      let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out[period - 1] = prev;
      for (let i = period; i < closes.length; i++) {
        prev = closes[i] * k + prev * (1 - k);
        out[i] = prev;
      }
      return out;
    };
    return { ema20: ema(20), ema50: ema(50) };
  }, [series]);

  return (
    <div>
      <SectionHeading
        eyebrow="AI Analyst"
        title="Analyze an instrument"
        description="Trend, structure, regime, momentum, volume and levels across seven timeframes — with an overall bias and any risk-defined setup the engine finds."
        action={
          analysis && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runAnalysis()}
              loading={analysing}
            >
              <RefreshCw className="size-3.5" strokeWidth={2} />
              Re-analyze
            </Button>
          )
        }
      />

      {/* ── Instrument selector bar ───────────────────────────── */}
      <div className="panel mb-3 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-2 rounded-[7px] border border-hairline-2 bg-surface-2 px-2.5 py-2 text-left hover:border-[#3a4049]"
            >
              <span className="text-[13.5px] font-semibold tracking-[-0.01em]">{symbol}</span>
              <span className="text-[11px] text-ink-3">{instrument?.name}</span>
              <Search className="size-3.5 text-ink-4" strokeWidth={2} />
            </button>

            <button
              onClick={() => void toggleWatch(symbol)}
              className={cn(
                "flex items-center gap-1 rounded-[7px] border px-2 py-2 text-[11px]",
                isWatched(symbol)
                  ? "border-[#d9a44140] bg-accent-soft text-accent"
                  : "border-hairline-2 bg-surface-2 text-ink-3 hover:text-ink-2",
              )}
              aria-pressed={isWatched(symbol)}
            >
              <Star className="size-3.5" strokeWidth={2} fill={isWatched(symbol) ? "currentColor" : "none"} />
              {isWatched(symbol) ? "Watching" : "Watch"}
            </button>

            {instrument && <Badge tone="muted">{ASSET_CLASS_LABEL[instrument.assetClass]}</Badge>}
            {analysis && <DemoBadge source={analysis.source} />}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              ariaLabel="Trading style"
              value={style}
              onChange={(v) => {
                setStyle(v);
                if (analysis) void runAnalysis();
              }}
              options={(["scalping", "day", "swing", "longterm"] as TradingStyle[]).map((s) => ({
                value: s,
                label: STYLE_LABEL[s],
              }))}
            />
            <Button variant="primary" size="md" onClick={() => void runAnalysis()} loading={analysing}>
              <Brain className="size-3.5" strokeWidth={2.2} />
              Analyze with AI
            </Button>
          </div>
        </div>

        {/* timeframe selector */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
          <span className="mr-1 text-[10px] uppercase tracking-[0.07em] text-ink-4">Chart TF</span>
          <button
            onClick={() => changeTimeframe(null)}
            className={cn(
              "rounded-[4px] px-1.5 py-0.5 text-[11px]",
              activeTf === null ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            Auto
          </button>
          {TIMEFRAMES.map((tf) => {
            const locked = !availableTfs.includes(tf);
            return (
              <button
                key={tf}
                disabled={locked}
                onClick={() => changeTimeframe(tf)}
                title={locked ? "Upgrade to Pro for all seven timeframes" : undefined}
                className={cn(
                  "flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px]",
                  activeTf === tf ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
                  locked && "cursor-not-allowed opacity-40",
                )}
              >
                {TIMEFRAME_LABEL[tf]}
                {locked && <Lock className="size-2.5" strokeWidth={2} />}
              </button>
            );
          })}
          {usage?.analysesLimit != null && (
            <span className="ml-auto tnum text-[10px] text-ink-4">
              {Math.max(0, (usage.analysesLimit ?? 0) - (usage.analysesUsedToday ?? 0))} of {usage.analysesLimit} analyses left today
            </span>
          )}
        </div>
      </div>

      {/* ── Errors / limits ──────────────────────────────────── */}
      {error && (
        <div className="mb-3">
          <Alert tone="danger" title="Analysis failed">
            {error}
          </Alert>
        </div>
      )}

      {limitReached && (
        <div className="mb-3">
          <Alert
            tone="warn"
            title="Daily analysis limit reached"
            action={
              <Link
                href="/app/settings?tab=billing"
                className="whitespace-nowrap rounded-[5px] bg-accent px-2 py-1 text-[10.5px] font-semibold text-accent-ink"
              >
                Upgrade
              </Link>
            }
          >
            You&apos;ve used {limitReached.used} of {limitReached.limit} free AI analyses today. Limits reset at
            00:00 UTC. The chart, risk calculator and scanner previews stay available.
          </Alert>
        </div>
      )}

      {/* ── Idle state with chart ────────────────────────────── */}
      {!analysis && !analysing && (
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <Panel
            title={`${symbol} · ${TIMEFRAME_LABEL[activeTf ?? "1h"]}`}
            subtitle={series ? `${series.source === "demo" ? "DEMO DATA" : "Live"} · ${series.candles.length} bars` : "Loading price data…"}
            dense
            action={series && <DemoBadge source={series.source} />}
          >
            <div className="px-2 pb-2">
              {series ? (
                <PriceChart
                  symbol={symbol}
                  candles={series.candles}
                  overlay={lastCandles}
                  levels={series.levels}
                  height={320}
                />
              ) : (
                <Skeleton className="h-[320px] w-full" />
              )}
            </div>
          </Panel>

          <Panel title="Ready when you are">
            <div className="py-4">
              <div className="mb-3 flex size-9 items-center justify-center rounded-[8px] border border-[#d9a44133] bg-accent-soft">
                <Sparkles className="size-4 text-accent" strokeWidth={1.9} />
              </div>
              <h3 className="text-[13px] font-medium text-ink">Run the AI analysis</h3>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
                The engine reads {symbol} across {availableTfs.length} timeframes, classifies the regime,
                maps support and resistance, then looks for a setup with a defined stop.
              </p>
              <div className="mt-3 space-y-1.5 text-[11px] text-ink-3">
                {[
                  "Market overview & regime",
                  "Multi-timeframe bias matrix",
                  "Key support / resistance",
                  "Setup with entry, stop, target",
                  "Invalidation conditions",
                  "Three forward scenarios",
                ].map((x) => (
                  <div key={x} className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-ink-4" />
                    {x}
                  </div>
                ))}
              </div>
              <Button
                variant="primary"
                size="md"
                className="mt-4 w-full"
                onClick={() => void runAnalysis()}
              >
                <Brain className="size-3.5" strokeWidth={2.2} />
                Analyze {symbol}
              </Button>
              <p className="mt-2 text-center text-[9.5px] text-ink-4">
                Based on available market data. Not a recommendation.
              </p>
            </div>
          </Panel>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────── */}
      {analysing && !analysis && (
        <div className="space-y-3">
          <div className="panel p-4">
            <div className="flex items-center gap-2 text-[12px] text-ink-2">
              <span className="size-3 animate-spin rounded-full border-[1.5px] border-accent border-t-transparent" />
              Reading {symbol} across {availableTfs.length} timeframes…
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="mt-3 h-40" />
          </div>
        </div>
      )}

      {/* ── Analysis result ──────────────────────────────────── */}
      {analysis && (
        <div className={cn("space-y-3 transition-opacity", analysing && "opacity-60")}>
          {/* Header strip */}
          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-semibold tracking-[-0.012em]">{analysis.symbol}</span>
                <span className="text-[11.5px] text-ink-3">{analysis.name}</span>
                <BiasBadge bias={analysis.overallBias} />
                <Badge tone="muted">{analysis.overview.regimeLabel}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-ink-4">
                <DemoBadge source={analysis.source} />
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" strokeWidth={1.8} />
                  Data as of {fmtDateTime(analysis.asOf)}
                </span>
                <span title={`Engine: ${analysis.engine}`}>· {analysis.engine}</span>
              </div>
            </div>

            {/* Overview metrics */}
            <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
              <OverviewCell
                label="Price"
                value={fmtPrice(analysis.price, analysis.symbol)}
                sub={`ATR ${analysis.overview.volatility.atrPct.toFixed(2)}%`}
              />
              <OverviewCell
                label="Overall bias"
                value={<span className={cn(analysis.overallBias === "bullish" ? "text-bull" : analysis.overallBias === "bearish" ? "text-bear" : "text-ink")}>
                  {analysis.overallBias.charAt(0).toUpperCase() + analysis.overallBias.slice(1)}
                </span>}
                sub={`Score ${analysis.overallScore > 0 ? "+" : ""}${analysis.overallScore}`}
              />
              <OverviewCell
                label="Market structure"
                value={<span className="text-[12px] leading-tight">{structureLabel(analysis.overview.structure)}</span>}
                sub={`${analysis.timeframes.filter((t) => t.bias === analysis.overallBias).length}/${analysis.timeframes.length} aligned`}
              />
              <OverviewCell
                label="Volatility"
                value={<span className="capitalize">{analysis.overview.volatility.label}</span>}
                sub={`Volume ${analysis.overview.volume.label}`}
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
            {/* Left column */}
            <div className="space-y-3">
              {/* Bias explanation */}
              <Panel title="Overall market bias" subtitle="Why the timeframes add up to this read">
                <p className="text-[12px] leading-relaxed text-ink-2">{analysis.biasExplanation}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[7px] border border-hairline bg-surface-2 p-2.5">
                    <div className="eyebrow mb-1">Momentum</div>
                    <p className="text-[11px] leading-relaxed text-ink-2">{analysis.overview.momentum}</p>
                  </div>
                  <div className="rounded-[7px] border border-hairline bg-surface-2 p-2.5">
                    <div className="eyebrow mb-1">Market structure</div>
                    <p className="text-[11px] leading-relaxed text-ink-2">{analysis.overview.structureNotes}</p>
                  </div>
                </div>
              </Panel>

              {/* Multi-timeframe matrix */}
              <Panel
                title="Multi-timeframe analysis"
                subtitle="Higher timeframes set direction; lower timeframes only set timing"
                action={
                  usage?.analysesLimit != null && (
                    <Link href="/app/settings?tab=billing" className="inline-flex items-center gap-1 text-[10.5px] text-accent hover:underline">
                      <Lock className="size-3" strokeWidth={2} />
                      {analysis.hiddenTimeframes.length} more on Pro
                    </Link>
                  )
                }
              >
                <div className="grid gap-1.5">
                  {TIMEFRAMES.map((tf) => {
                    const reading = analysis.timeframes.find((t) => t.timeframe === tf);
                    const locked = !reading;
                    return (
                      <div
                        key={tf}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[6px] border px-2.5 py-1.5",
                          locked ? "border-dashed border-hairline bg-transparent" : "border-hairline bg-surface-2",
                        )}
                      >
                        <span className="w-7 shrink-0 text-[11px] font-medium text-ink-3">{TIMEFRAME_LABEL[tf]}</span>
                        {locked ? (
                          <span className="flex flex-1 items-center gap-1.5 text-[10.5px] text-ink-4">
                            <Lock className="size-3" strokeWidth={2} />
                            Available on Pro
                          </span>
                        ) : (
                          <>
                            <div className="flex w-[76px] shrink-0 items-center gap-1.5">
                              {reading!.bias === "bullish" ? (
                                <TrendingUp className="size-3.5 text-bull" strokeWidth={2.1} />
                              ) : reading!.bias === "bearish" ? (
                                <TrendingDown className="size-3.5 text-bear" strokeWidth={2.1} />
                              ) : (
                                <span className="h-px w-3.5 bg-ink-4" />
                              )}
                              <span
                                className={cn(
                                  "text-[11px] capitalize",
                                  reading!.bias === "bullish" ? "text-bull" : reading!.bias === "bearish" ? "text-bear" : "text-ink-3",
                                )}
                              >
                                {reading!.bias}
                              </span>
                            </div>
                            <div className="flex flex-1 items-center gap-2">
                              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                                <div
                                  className={cn(
                                    "absolute top-0 h-full rounded-full",
                                    reading!.score > 0 ? "left-1/2 bg-bull" : "right-1/2 bg-bear",
                                  )}
                                  style={{ width: `${Math.min(50, Math.abs(reading!.score) / 2)}%` }}
                                />
                                <div className="absolute inset-y-0 left-1/2 w-px bg-[#3a4049]" />
                              </div>
                              <span className="tnum w-9 text-right text-[10.5px] text-ink-3">
                                {reading!.score > 0 ? "+" : ""}
                                {reading!.score}
                              </span>
                            </div>
                            <span className="tnum hidden w-14 shrink-0 text-right text-[9.5px] text-ink-4 sm:block">
                              ADX {Math.round(reading!.trendStrength)} · σ{reading!.volatilityPct.toFixed(1)}%
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {/* Chart with AI levels */}
              <Panel
                title="Price action"
                subtitle={series ? `${TIMEFRAME_LABEL[analysis.timeframe]} · entry/stop/target drawn` : "Loading…"}
                dense
                action={series && <DemoBadge source={series.source} />}
              >
                <div className="px-2 pb-2">
                  {series ? (
                    <PriceChart
                      symbol={analysis.symbol}
                      candles={series.candles}
                      overlay={lastCandles}
                      levels={series.levels}
                      setup={analysis.setups[0]}
                      height={300}
                    />
                  ) : (
                    <Skeleton className="h-[300px] w-full" />
                  )}
                </div>
              </Panel>

              {/* Scenarios */}
              <Panel title="Forward scenarios" subtitle="What the engine expects, and what would confirm each path">
                <div className="space-y-2">
                  {analysis.scenarios.map((s) => (
                    <div key={s.name} className="rounded-[7px] border border-hairline bg-surface-2 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-ink">{s.name}</span>
                        <Badge
                          tone={s.probability === "most likely" ? "accent" : s.probability === "alternative" ? "info" : "muted"}
                        >
                          {s.probability}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{s.summary}</p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-ink-4">
                        <span className="text-ink-3">Trigger:</span> {s.triggers}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* Right column */}
            <div className="space-y-3">
              {/* Setups */}
              <Panel
                title="AI opportunity detection"
                subtitle={`${analysis.setups.length} setup${analysis.setups.length === 1 ? "" : "s"} clearing the confluence bar`}
              >
                {analysis.setups.length === 0 ? (
                  <EmptyState
                    icon={<CircleAlert className="size-4" />}
                    title="No qualifying setup"
                    description="Nothing here clears the engine's confluence threshold. That is a legitimate result — forcing a trade in these conditions is how traders donate capital."
                  />
                ) : (
                  <div className="space-y-2.5">
                    {analysis.setups.slice(0, 2).map((s) => (
                      <SetupCard
                        key={s.id}
                        setup={s}
                        source={analysis.source}
                        onOpenReasoning={() => setSetupModal(s)}
                        onPaperTrade={() => setSetupModal(s)}
                        onRisk={() => setSetupModal(s)}
                        compact
                      />
                    ))}
                  </div>
                )}
              </Panel>

              {/* Key levels */}
              <Panel title="Key price levels" subtitle={analysis.overview.keyLevelNote}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="eyebrow mb-1.5 text-bear">Resistance</div>
                    <div className="space-y-1">
                      {analysis.overview.resistances.slice(0, 4).map((l, i) => (
                        <div key={`r-${i}`} className="flex items-center justify-between gap-2">
                          <span className="tnum text-[11.5px] text-ink-2">{fmtPrice(l.price, analysis.symbol)}</span>
                          <span className="text-[9.5px] text-ink-4">{l.touches}×</span>
                        </div>
                      ))}
                      {!analysis.overview.resistances.length && <span className="text-[11px] text-ink-4">None mapped</span>}
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow mb-1.5 text-bull">Support</div>
                    <div className="space-y-1">
                      {analysis.overview.supports.slice(0, 4).map((l, i) => (
                        <div key={`s-${i}`} className="flex items-center justify-between gap-2">
                          <span className="tnum text-[11.5px] text-ink-2">{fmtPrice(l.price, analysis.symbol)}</span>
                          <span className="text-[9.5px] text-ink-4">{l.touches}×</span>
                        </div>
                      ))}
                      {!analysis.overview.supports.length && <span className="text-[11px] text-ink-4">None mapped</span>}
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Indicators */}
              <Panel title="Technical readings" subtitle={TIMEFRAME_LABEL[analysis.timeframe]}>
                <div className="grid grid-cols-2 gap-x-4">
                  <IndRow label="RSI (14)" value={fmtNum(analysis.overview.indicators.rsi14, 1)} tone={rsiTone(analysis.overview.indicators.rsi14)} />
                  <IndRow label="ADX (14)" value={fmtNum(analysis.overview.indicators.adx, 1)} />
                  <IndRow label="MACD hist" value={fmtNum(analysis.overview.indicators.macd.histogram, 2)} tone={analysis.overview.indicators.macd.histogram > 0 ? "bull" : "bear"} />
                  <IndRow label="ATR %" value={`${analysis.overview.volatility.atrPct.toFixed(2)}%`} />
                  <IndRow label="EMA 20" value={fmtPrice(analysis.overview.indicators.ema20, analysis.symbol)} />
                  <IndRow label="EMA 50" value={fmtPrice(analysis.overview.indicators.ema50, analysis.symbol)} />
                  <IndRow label="BB width" value={`${analysis.overview.indicators.bb.widthPct.toFixed(2)}%`} />
                  <IndRow label="Vol ratio" value={`${analysis.overview.indicators.volumeRatio.toFixed(2)}×`} tone={analysis.overview.indicators.volumeRatio > 1.2 ? "bull" : undefined} />
                </div>
              </Panel>

              {/* Risk awareness */}
              <Panel title="Risk & invalidation" subtitle="What would make this read wrong">
                <ul className="space-y-2">
                  {analysis.riskNotes.map((r, i) => (
                    <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-ink-2">
                      <span className="mt-[6px] size-1 shrink-0 rounded-full bg-accent/70" />
                      {r}
                    </li>
                  ))}
                </ul>
              </Panel>

              {/* Narrative */}
              <Panel title="Analyst note" subtitle="Written from the structured output above">
                <div className="space-y-2.5">
                  {analysis.narrative.split("\n\n").map((p, i) => (
                    <p key={i} className={cn("text-[11.5px] leading-relaxed", i === analysis.narrative.split("\n\n").length - 1 ? "text-ink-4" : "text-ink-2")}>
                      {p}
                    </p>
                  ))}
                </div>
                <p className="mt-3 border-t border-hairline pt-2 text-[9.5px] leading-relaxed text-ink-4">
                  {analysis.dataDisclaimer}
                </p>
              </Panel>
            </div>
          </div>
        </div>
      )}

      {/* ── Instrument picker ────────────────────────────────── */}
      <InstrumentPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(s) => {
          changeSymbol(s);
          setPickerOpen(false);
        }}
        watchlist={user?.watchlist ?? []}
        current={symbol}
      />

      {/* ── Setup detail / paper trade modal ─────────────────── */}
      {setupModal && (
        <SetupActionModal
          setup={setupModal}
          onClose={() => setSetupModal(null)}
          onDone={(msg) => {
            toast(msg);
            setSetupModal(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Small pieces ───────────────────────────────────────────── */

function OverviewCell({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="px-3.5 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 text-[14px] font-medium tracking-[-0.01em] tnum">{value}</div>
      <div className="tnum text-[10px] text-ink-4">{sub}</div>
    </div>
  );
}

function IndRow({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#1a1e24] py-1 last:border-0">
      <span className="text-[10.5px] text-ink-3">{label}</span>
      <span className={cn("tnum text-[11.5px]", tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-ink-2")}>
        {value}
      </span>
    </div>
  );
}

function rsiTone(v: number): "bull" | "bear" | undefined {
  if (v >= 70) return "bear";
  if (v <= 30) return "bull";
  return undefined;
}

function structureLabel(s: AIAnalysis["overview"]["structure"]): string {
  switch (s) {
    case "higher-highs-higher-lows":
      return "Higher highs / higher lows";
    case "lower-highs-lower-lows":
      return "Lower highs / lower lows";
    case "transition":
      return "Transitional";
    default:
      return "Range";
  }
}

/* ── Instrument picker ─────────────────────────────────────── */

function InstrumentPicker({
  open,
  onClose,
  onPick,
  watchlist,
  current,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
  watchlist: string[];
  current: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = INSTRUMENTS.filter(
    (i) =>
      !query ||
      i.symbol.toLowerCase().includes(query.toLowerCase()) ||
      i.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Modal open={open} onClose={onClose} title="Choose an instrument" description="Fourteen instruments across five asset classes">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search BTC, gold, nasdaq…"
          className="h-9 w-full rounded-[7px] border border-hairline-2 bg-surface-2 pl-8 pr-3 text-[12.5px] text-ink placeholder:text-ink-4 focus:border-[#3d444e] focus:outline-none"
        />
      </div>
      <div className="-mx-1 max-h-[52vh] overflow-y-auto">
        {filtered.map((i) => (
          <button
            key={i.symbol}
            onClick={() => onPick(i.symbol)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-[6px] px-2 py-2 text-left hover:bg-surface-2",
              current === i.symbol && "bg-surface-2",
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-medium text-ink">{i.symbol}</span>
                <span className="text-[10.5px] text-ink-4">{ASSET_CLASS_LABEL[i.assetClass]}</span>
                {watchlist.includes(i.symbol) && <Star className="size-2.5 text-accent" fill="currentColor" />}
              </div>
              <div className="truncate text-[10.5px] text-ink-3">{i.blurb}</div>
            </div>
            <ChevronRight className="size-3.5 shrink-0 text-ink-4" />
          </button>
        ))}
        {!filtered.length && <p className="px-2 py-6 text-center text-[11.5px] text-ink-4">No instruments match.</p>}
      </div>
    </Modal>
  );
}

/* ── Setup action modal ────────────────────────────────────── */

function SetupActionModal({
  setup,
  onClose,
  onDone,
}: {
  setup: TradeSetup;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { user, refresh } = useSession();
  const [size, setSize] = useState("");
  const [stop, setStop] = useState(String(setup.stop));
  const [tp, setTp] = useState(String(setup.takeProfit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = user?.preferences.defaultBalance ?? 10000;
  const riskPct = user?.preferences.defaultRiskPct ?? 1;
  const riskAmount = (balance * riskPct) / 100;
  const entryMid = (setup.entryLow + setup.entryHigh) / 2;
  const stopDist = Math.abs(entryMid - Number(stop) || 0);
  const suggested = stopDist > 0 ? riskAmount / stopDist : 0;

  useEffect(() => {
    setSize(suggested > 0 ? suggested.toFixed(4) : "");
  }, [suggested]);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/paper", {
        symbol: setup.symbol,
        direction: setup.direction,
        size: Number(size),
        entry: entryMid,
        stop: Number(stop),
        takeProfit: Number(tp),
        setupId: setup.id,
        notes: `From AI setup · ${setup.quality} confluence · ${setup.riskReward.toFixed(1)}:1`,
      });
      void refresh();
      onDone(`${setup.symbol} ${setup.direction} opened in paper trading`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not open the position.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${setup.symbol} · ${setup.direction.toUpperCase()}`}
      description={`Paper trade this setup · ${TIMEFRAME_LABEL[setup.timeframe]} · AI confidence ${setup.confidence}/100`}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Link
            href={`/app/risk?symbol=${encodeURIComponent(setup.symbol)}&entry=${entryMid}&stop=${setup.stop}&tp=${setup.takeProfit}&dir=${setup.direction}`}
            className="inline-flex h-9.5 items-center rounded-[7px] border border-hairline-2 bg-surface-3 px-4 text-[13px] font-medium text-ink hover:bg-[#22262e]"
          >
            Open Risk Manager
          </Link>
          <Button variant="primary" size="md" onClick={open} loading={busy} disabled={!Number(size)}>
            Open paper trade
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-[6px] border border-hairline-2 bg-surface-2 px-2 py-1.5">
            <div className="text-[9.5px] uppercase tracking-[0.07em] text-ink-4">Entry</div>
            <div className="tnum text-[11.5px] text-ink">{fmtPrice(entryMid, setup.symbol)}</div>
          </div>
          <div className="rounded-[6px] border border-hairline-2 bg-surface-2 px-2 py-1.5">
            <div className="text-[9.5px] uppercase tracking-[0.07em] text-ink-4">Stop</div>
            <div className="tnum text-[11.5px] text-bear">{fmtPrice(setup.stop, setup.symbol)}</div>
          </div>
          <div className="rounded-[6px] border border-hairline-2 bg-surface-2 px-2 py-1.5">
            <div className="text-[9.5px] uppercase tracking-[0.07em] text-ink-4">Target</div>
            <div className="tnum text-[11.5px] text-bull">{fmtPrice(setup.takeProfit, setup.symbol)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10.5px] text-ink-3">Size</span>
            <NumericInput value={size} onValueChange={setSize} aria-label="Position size" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] text-ink-3">Stop</span>
            <NumericInput value={stop} onValueChange={setStop} aria-label="Stop loss" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] text-ink-3">Target</span>
            <NumericInput value={tp} onValueChange={setTp} aria-label="Take profit" />
          </label>
        </div>

        <div className="rounded-[7px] border border-hairline bg-surface-2 px-3 py-2.5">
          <StatRow label="Account equity" value={`$${balance.toLocaleString("en-US")}`} />
          <StatRow label="Risk per trade" value={`${riskPct}% · $${riskAmount.toFixed(2)}`} tone="bear" />
          <StatRow label="Position notional" value={`$${(Number(size) * entryMid || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`} />
          <StatRow
            label="Reward if target hit"
            value={`$${(riskAmount * setup.riskReward).toFixed(2)}`}
            tone="bull"
          />
        </div>

        <p className="text-[10px] leading-relaxed text-ink-4">
          Opening this position uses the current mark as entry unless you change it. Paper trading is
          simulated and separate from real performance. {setup.riskNote}
        </p>
      </div>
    </Modal>
  );
}
