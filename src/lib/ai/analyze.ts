/**
 * AI Engine orchestrator.
 *
 * Pipeline:
 *   series → technical (per timeframe) → regime → market overview
 *          → aggregate bias → opportunity detection → narrative
 *
 * Every stage returns structured, inspectable data. The narrative layer is
 * presentation only; it may never introduce numbers that the structured
 * stages did not produce.
 */

import { aggregateBias, buildMarketOverview } from "./market";
import { detectRegime } from "./regime";
import { detectSetups, preferredTimeframes } from "./opportunity";
import { analyzeTimeframe } from "./technical";
import { buildNarrative, buildScenarios, collectRiskNotes } from "./narrative";
import { getInstrument } from "../instruments";
import type {
  AIAnalysis,
  SeriesBundle,
  Timeframe,
  TimeframeReading,
  TradingStyle,
} from "../types";
import { TIMEFRAME_LABEL, TIMEFRAMES } from "../types";

export interface AnalyzeOptions {
  symbol: string;
  bundle: SeriesBundle;
  /** Timeframe the detailed overview is computed on. */
  timeframe?: Timeframe;
  style?: TradingStyle;
  /** Restrict timeframes analysed (free plan shows fewer). */
  maxTimeframes?: number;
  generatedAt?: number;
}

const STYLE_ANCHOR: Record<TradingStyle, Timeframe> = {
  scalping: "15m",
  day: "1h",
  swing: "4h",
  longterm: "1d",
};

export function anchorTimeframeFor(style: TradingStyle): Timeframe {
  return STYLE_ANCHOR[style];
}

/**
 * Timeframes shown to the user, ordered around their style.
 *
 * A free plan gets four timeframes, but they must be the four that matter for
 * the trader's style — showing a swing trader 1m–1H would be useless and would
 * hide every setup the engine can actually generate.
 */
const STYLE_VISIBLE: Record<TradingStyle, Timeframe[]> = {
  scalping: ["1m", "5m", "15m", "1h", "4h"],
  day: ["5m", "15m", "1h", "4h", "1d"],
  swing: ["15m", "1h", "4h", "1d", "1w"],
  longterm: ["1h", "4h", "1d", "1w"],
};

export function visibleTimeframes(style: TradingStyle, depth: number): Timeframe[] {
  // Full depth (Pro) shows the complete 1m–1W ladder — that is the entitlement.
  if (depth >= TIMEFRAMES.length) return TIMEFRAMES;
  const ordered = STYLE_VISIBLE[style] ?? STYLE_VISIBLE.day;
  const core = new Set(ordered.slice(0, Math.max(3, depth)));
  const selected = TIMEFRAMES.filter((tf) => core.has(tf));
  return selected.length ? selected : TIMEFRAMES.slice(0, Math.max(3, depth));
}

export function analyzeBundle(options: AnalyzeOptions): AIAnalysis {
  const { bundle } = options;
  const symbol = options.symbol;
  const inst = getInstrument(symbol);
  if (!inst) throw new Error(`Unknown instrument ${symbol}`);

  const style = options.style ?? "day";
  const now = options.generatedAt ?? Date.now();
  const timeframe = options.timeframe ?? STYLE_ANCHOR[style];

  // Analyse every timeframe internally — the engine needs the full picture to
  // rank confluence. `maxTimeframes` only gates what is *shown*.
  const tfsToAnalyze: Timeframe[] = TIMEFRAMES;

  const signals = tfsToAnalyze
    .map((tf) => {
      const candles = bundle.series[tf];
      if (!candles || candles.length < 55) return null;
      return { tf, signal: analyzeTimeframe(candles, tf) };
    })
    .filter((x): x is { tf: Timeframe; signal: ReturnType<typeof analyzeTimeframe> } => x !== null);

  if (!signals.length) {
    throw new Error(`Insufficient market data for ${symbol}`);
  }

  const allReadings: TimeframeReading[] = signals.map((s) => s.signal.reading);
  const visible = visibleTimeframes(style, options.maxTimeframes ?? TIMEFRAMES.length);
  const readings = allReadings.filter((r) => visible.includes(r.timeframe));
  const hiddenTimeframes = allReadings
    .filter((r) => !visible.includes(r.timeframe))
    .map((r) => r.timeframe);
  const anchorSignal = signals.find((s) => s.tf === timeframe) ?? signals[signals.length - 1];
  const anchorCandles = bundle.series[anchorSignal.tf];

  const higher = signals.filter((s) => ["4h", "1d", "1w"].includes(s.tf));
  const higherBias = aggregateBias(higher.map((s) => s.signal.reading)).bias;

  const regime = detectRegime(anchorCandles, anchorSignal.signal, higherBias);
  const overview = buildMarketOverview(anchorCandles, anchorSignal.signal, regime);
  const aggregate = aggregateBias(allReadings);

  // Opportunity detection across the style's timeframes, best first.
  const candidates = preferredTimeframes(style)
    .filter((tf) => bundle.series[tf]?.length > 60)
    .flatMap((tf) => {
      const candles = bundle.series[tf];
      const sig = signals.find((s) => s.tf === tf);
      if (!sig) return [];
      const tfRegime = tf === anchorSignal.tf ? regime : detectRegime(candles, sig.signal, higherBias);
      const tfOverview = tf === anchorSignal.tf ? overview : buildMarketOverview(candles, sig.signal, tfRegime);
      return detectSetups({
        symbol,
        candles,
        timeframe: tf,
        style,
        overview: tfOverview,
        readings: allReadings,
        overallBias: aggregate.bias,
        demo: bundle.source === "demo",
        now,
      });
    });

  const qualityRank = { high: 0, medium: 1, low: 2 } as const;
  const setups = candidates
    .sort((a, b) => qualityRank[a.quality] - qualityRank[b.quality] || b.confidence - a.confidence)
    .slice(0, 3);

  const scenarios = buildScenarios({ overview, aggregate, regime, timeframe });
  const riskNotes = collectRiskNotes({ overview, regime, setups, readings });
  const narrative = buildNarrative({
    symbol,
    name: inst.name,
    overview,
    aggregate,
    regime,
    readings,
    setups,
    timeframe,
    demo: bundle.source === "demo",
    style,
  });

  return {
    symbol,
    name: inst.name,
    assetClass: inst.assetClass,
    timeframe,
    source: bundle.source,
    provider: bundle.provider,
    asOf: bundle.asOf,
    price: overview.price,
    overview,
    timeframes: readings,
    hiddenTimeframes,
    overallBias: aggregate.bias,
    overallScore: aggregate.score,
    biasExplanation: aggregate.explanation,
    scenarios,
    setups,
    riskNotes,
    narrative,
    engine: "tradia-engine-v1.4",
    dataDisclaimer:
      bundle.source === "demo"
        ? "Analysis computed on DEMO DATA — simulated prices for product evaluation, not live market quotes."
        : `Analysis computed on live market data from ${bundle.provider} as of ${new Date(bundle.asOf).toISOString()}.`,
  };
}

/** Compact multi-timeframe matrix used by the scanner and chat. */
export function timeframeMatrix(analysis: AIAnalysis): { timeframe: Timeframe; label: string; bias: string; score: number }[] {
  return analysis.timeframes.map((r) => ({
    timeframe: r.timeframe,
    label: TIMEFRAME_LABEL[r.timeframe],
    bias: r.bias,
    score: r.score,
  }));
}
