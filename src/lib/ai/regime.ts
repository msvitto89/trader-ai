/**
 * Market Regime Detector — classifies the environment so the rest of the
 * engine can pick tactics that actually fit conditions.
 */

import { normalizedSlope } from "../indicators";
import type { Bias, Candle, MarketRegime } from "../types";
import type { TimeframeSignal } from "./technical";

export interface RegimeResult {
  regime: MarketRegime;
  label: string;
  explanation: string;
  /** Regimes where momentum entries are favoured. */
  tradeable: boolean;
}

export function detectRegime(
  candles: Candle[],
  reading: TimeframeSignal,
  higherBias: Bias,
): RegimeResult {
  const closes = candles.map((c) => c.c);
  const price = closes[closes.length - 1] ?? 1;
  const atrPct = reading.detail.atrPct;
  const slope = reading.detail.slopePct;
  const adx = reading.detail.adx;
  const recent = candles.slice(-30);
  const rangePct = ((Math.max(...recent.map((c) => c.h)) - Math.min(...recent.map((c) => c.l))) / price) * 100;
  const older = candles.slice(-90, -30);
  const olderRangePct =
    older.length > 5
      ? ((Math.max(...older.map((c) => c.h)) - Math.min(...older.map((c) => c.l))) / price) * 100
      : rangePct;

  const slopeAbs = Math.abs(slope);

  if (atrPct > reading.reading.volatilityPct * 1.6 && atrPct > 1.1) {
    return {
      regime: "high-volatility",
      label: "High volatility",
      explanation:
        "Range expansion is well above its own baseline. Stops must be wider, size smaller, and entries should wait for a completed retest rather than the initial impulse.",
      tradeable: true,
    };
  }

  if (olderRangePct > 0.01 && rangePct < olderRangePct * 0.62 && adx < 22) {
    return {
      regime: "compression",
      label: "Compression / coil",
      explanation:
        "Volatility is contracting inside a narrowing range. This precedes expansion: the first decisive close outside the coil is the event to trade, not the chop inside it.",
      tradeable: true,
    };
  }

  if (adx >= 24 && slopeAbs > 0.035) {
    const up = slope > 0;
    return {
      regime: up ? "trending-up" : "trending-down",
      label: up ? "Trending up" : "Trending down",
      explanation: up
        ? "Directional trend with ADX confirmation and a rising EMA slope. Pullbacks into dynamic support are the higher-probability entries; fading strength is the lower-probability one."
        : "Directional downtrend with ADX confirmation and a falling EMA slope. Rallies into dynamic resistance are the higher-probability shorts; catching the low is speculative.",
      tradeable: true,
    };
  }

  if (adx < 20 && Math.abs(slope) < 0.03) {
    return {
      regime: "ranging",
      label: "Range-bound",
      explanation:
        "No directional edge: price is oscillating around a flat mean. Mean-reversion at the edges of the range is the tactical play; breakout entries here have a high failure rate.",
      tradeable: higherBias === "neutral",
    };
  }

  return {
    regime: higherBias === "bearish" ? "trending-down" : "trending-up",
    label: "Transitional trend",
    explanation:
      "Trend strength is building but not yet confirmed on every measure. Treat the most recent swing as the reference: structure holding favours continuation, structure breaking favours a regime change.",
    tradeable: true,
  };
}

/** Simple trendline slope over the last N closes, in percent per bar. */
export function structuralSlope(candles: Candle[], lookback = 40): number {
  return normalizedSlope(candles.slice(-lookback).map((c) => c.c), lookback);
}
