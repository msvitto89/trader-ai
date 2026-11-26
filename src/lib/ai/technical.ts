/**
 * Technical Analyzer — turns one timeframe's candles into a directional score
 * plus human-readable evidence. Every score contribution is traceable so the
 * UI can explain *why*, not just *what*.
 */

import { adx, computeIndicators, ema, normalizedSlope, realizedVol, rsi } from "../indicators";
import type { Bias, Candle, Timeframe, TimeframeReading } from "../types";

export interface TimeframeSignal {
  reading: TimeframeReading;
  detail: {
    emaAlignment: "stacked-up" | "stacked-down" | "mixed" | "flat";
    rsi: number;
    macdHistogram: number;
    adx: number;
    aboveEma200: boolean | null;
    slopePct: number;
    atrPct: number;
    volumeRatio: number;
    rangePosition: number;
  };
}

const clampScore = (v: number) => Math.max(-100, Math.min(100, v));

export function analyzeTimeframe(candles: Candle[], timeframe: Timeframe): TimeframeSignal {
  const closes = candles.map((c) => c.c);
  const price = closes[closes.length - 1] ?? 0;
  const ind = computeIndicators(candles);
  const notes: string[] = [];
  let score = 0;

  // ── Trend structure: EMA stack (weight 32) ────────────────────
  const emaAlignment =
    ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200
      ? "stacked-up"
      : ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200
        ? "stacked-down"
        : Math.abs(ind.ema20 - ind.ema50) < price * 0.001
          ? "flat"
          : "mixed";

  if (emaAlignment === "stacked-up") {
    score += 32;
    notes.push(`EMA stack aligned upward (20 > 50 > 200) — trend structure intact.`);
  } else if (emaAlignment === "stacked-down") {
    score -= 32;
    notes.push(`EMA stack aligned downward (20 < 50 < 200) — sellers in control.`);
  } else if (emaAlignment === "flat") {
    notes.push(`Moving averages compressed — no dominant trend.`);
  } else {
    const mid = (price - ind.ema50) / price;
    score += clampScore(mid * 3000) * 0.3;
    notes.push(`Moving averages mixed; price is ${mid >= 0 ? "above" : "below"} the 50 EMA.`);
  }

  const aboveEma200 = candles.length >= 200 ? price > ind.ema200 : null;
  if (aboveEma200 !== null) {
    score += aboveEma200 ? 8 : -8;
  }

  // ── Momentum: RSI + MACD histogram (weight 26) ────────────────
  const rsiSeries = rsi(closes, 14);
  const rsiNow = rsiSeries[rsiSeries.length - 1] ?? 50;
  const rsiPrev = rsiSeries[rsiSeries.length - 6] ?? rsiNow;
  const rsiDelta = rsiNow - rsiPrev;
  const rsiScore = clampScore((rsiNow - 50) * 2.2);
  score += rsiScore * 0.16;

  if (rsiNow >= 70) {
    notes.push(`RSI ${rsiNow.toFixed(0)} is extended — chasing here carries poor entry risk.`);
  } else if (rsiNow <= 30) {
    notes.push(`RSI ${rsiNow.toFixed(0)} is oversold — watch for stabilisation, not a blind long.`);
  } else {
    notes.push(`RSI ${rsiNow.toFixed(0)} (${rsiDelta >= 0 ? "rising" : "falling"}) leaves room in the ${rsiNow > 50 ? "bullish" : "bearish"} camp.`);
  }

  const hist = ind.macd.histogram;
  const histNorm = price ? hist / price : 0;
  score += clampScore(histNorm * 100_000) * 0.13;
  if (Math.abs(histNorm) < price * 0.00002) {
    notes.push("MACD histogram is near the zero line — momentum is not committed.");
  } else {
    notes.push(
      `MACD histogram ${hist > 0 ? "positive" : "negative"} — momentum is ${hist > 0 ? "with buyers" : "with sellers"}.`,
    );
  }

  // ── Trend strength: ADX (weight 10) ───────────────────────────
  const adxSeries = adx(candles, 14);
  const adxNow = adxSeries[adxSeries.length - 1] ?? 20;
  const slopePct = normalizedSlope(ema(closes, 21), 20);
  if (adxNow > 25) {
    score += Math.sign(slopePct) * 10;
    notes.push(`ADX ${adxNow.toFixed(0)} — directional trend is dominant, not chop.`);
  } else {
    notes.push(`ADX ${adxNow.toFixed(0)} — trend strength is limited; range tactics apply.`);
  }

  // ── Slope of the 21 EMA (weight 8) ────────────────────────────
  score += clampScore(slopePct * 55) * 0.08;

  // ── Volume confirmation (weight 6) ────────────────────────────
  if (ind.volumeRatio > 1.25) {
    score += Math.sign(score) * 6;
    notes.push(`Volume is ${(ind.volumeRatio * 100 - 100).toFixed(0)}% above its 20-bar average — participation confirms the move.`);
  } else if (ind.volumeRatio < 0.7) {
    notes.push(`Volume is thin (${(ind.volumeRatio * 100).toFixed(0)}% of average) — breakouts are less reliable.`);
  }

  // ── Position in the recent range (weight 6) ───────────────────
  const lookback = candles.slice(-40);
  const hh = Math.max(...lookback.map((c) => c.h));
  const ll = Math.min(...lookback.map((c) => c.l));
  const rangePos = hh === ll ? 0.5 : (price - ll) / (hh - ll);
  score += clampScore((rangePos - 0.5) * 60) * 0.06;

  const atrPct = ind.atrPct || realizedVol(closes) * 1.2;

  score = clampScore(score);
  const bias: Bias = score > 14 ? "bullish" : score < -14 ? "bearish" : "neutral";

  const trendStrength =
    emaAlignment === "stacked-up" || emaAlignment === "stacked-down"
      ? Math.min(100, 55 + adxNow * 1.1)
      : Math.min(100, adxNow);

  return {
    reading: {
      timeframe,
      bias,
      score: Math.round(score),
      momentum: Math.round(clampScore(rsiScore * 0.5 + histNorm * 40_000 * 0.5)),
      trendStrength: Math.round(trendStrength),
      volatilityPct: Number(atrPct.toFixed(2)),
      notes: notes.slice(0, 4),
    },
    detail: {
      emaAlignment,
      rsi: rsiNow,
      macdHistogram: hist,
      adx: adxNow,
      aboveEma200,
      slopePct,
      atrPct,
      volumeRatio: ind.volumeRatio,
      rangePosition: rangePos,
    },
  };
}
