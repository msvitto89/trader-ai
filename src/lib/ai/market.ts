/**
 * Market Analyzer — single-timeframe market overview plus the multi-timeframe
 * aggregation that produces the overall bias. Weighting is deliberately
 * hierarchy-based: higher timeframes set context, lower timeframes time entries.
 */

import { computeIndicators, findLevels } from "../indicators";
import type {
  Bias,
  Candle,
  IndicatorSnapshot,
  MarketOverview,
  Timeframe,
  TimeframeReading,
} from "../types";
import { TIMEFRAME_LABEL } from "../types";
import type { TimeframeSignal } from "./technical";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function detectStructure(
  candles: Candle[],
): { structure: MarketOverview["structure"]; notes: string } {
  const recent = candles.slice(-120);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];
    if (c.h > recent[i - 1].h && c.h > recent[i - 2].h && c.h > recent[i + 1].h && c.h > recent[i + 2].h) {
      swingHighs.push(c.h);
    }
    if (c.l < recent[i - 1].l && c.l < recent[i - 2].l && c.l < recent[i + 1].l && c.l < recent[i + 2].l) {
      swingLows.push(c.l);
    }
  }
  if (swingHighs.length < 2 || swingLows.length < 2) {
    return { structure: "range", notes: "Not enough completed swings to read structure cleanly." };
  }
  const lastH = swingHighs.slice(-3);
  const lastL = swingLows.slice(-3);
  const hh = lastH.length >= 2 && lastH[lastH.length - 1] > lastH[lastH.length - 2];
  const hl = lastL.length >= 2 && lastL[lastL.length - 1] > lastL[lastL.length - 2];
  const lh = lastH.length >= 2 && lastH[lastH.length - 1] < lastH[lastH.length - 2];
  const ll = lastL.length >= 2 && lastL[lastL.length - 1] < lastL[lastL.length - 2];

  if (hh && hl) {
    return {
      structure: "higher-highs-higher-lows",
      notes: "Price is printing higher highs and higher lows — buyers keep defending each pullback.",
    };
  }
  if (lh && ll) {
    return {
      structure: "lower-highs-lower-lows",
      notes: "Price is printing lower highs and lower lows — every bounce is being sold into.",
    };
  }
  if ((lh && hl) || (hh && ll)) {
    return {
      structure: "transition",
      notes: "Swings are contradictory (a lower high with a higher low, or vice versa) — the trend is not settled.",
    };
  }
  return {
    structure: "range",
    notes: "Swings are overlapping with no clear directional progress — rotational price action.",
  };
}

function volatilityLabel(atrPct: number): MarketOverview["volatility"]["label"] {
  if (atrPct < 0.35) return "low";
  if (atrPct < 1.1) return "normal";
  if (atrPct < 2.2) return "elevated";
  return "high";
}

function volumeLabel(ratio: number): MarketOverview["volume"]["label"] {
  if (ratio < 0.7) return "thin";
  if (ratio < 1.3) return "normal";
  if (ratio < 2.1) return "expanding";
  return "climactic";
}

export function buildMarketOverview(
  candles: Candle[],
  signal: TimeframeSignal,
  regime: ReturnType<typeof import("./regime").detectRegime>,
): MarketOverview {
  const price = candles[candles.length - 1]?.c ?? 0;
  const ind: IndicatorSnapshot = computeIndicators(candles);
  const structure = detectStructure(candles);
  const levels = findLevels(candles, price, ind.atr14 || price * 0.01);

  const supports = levels.filter((l) => l.kind === "support").slice(0, 4);
  const resistances = levels.filter((l) => l.kind === "resistance").slice(0, 4);

  const nearestResistance = resistances.length ? Math.min(...resistances.map((l) => l.price)) : price * 1.02;
  const nearestSupport = supports.length ? Math.max(...supports.map((l) => l.price)) : price * 0.98;

  let keyLevelNote: string;
  const toRes = ((nearestResistance - price) / price) * 100;
  const toSup = ((price - nearestSupport) / price) * 100;
  if (signal.reading.bias === "bullish") {
    keyLevelNote = `${nearestSupport.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} is the support that must hold (${toSup.toFixed(2)}% below). Beyond ${nearestResistance.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} (${toRes.toFixed(2)}% above) the path to the next liquidity pocket opens.`;
  } else if (signal.reading.bias === "bearish") {
    keyLevelNote = `${nearestResistance.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} caps price (${toRes.toFixed(2)}% above). Losing ${nearestSupport.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} (${toSup.toFixed(2)}% below) opens the next leg lower.`;
  } else {
    keyLevelNote = `Price sits between ${nearestSupport.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} support and ${nearestResistance.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} resistance. Trade the edges, not the middle.`;
  }

  const momentumBits: string[] = [];
  momentumBits.push(
    ind.macd.histogram > 0 ? "MACD above signal" : ind.macd.histogram < 0 ? "MACD below signal" : "MACD flat",
  );
  momentumBits.push(`RSI ${ind.rsi14.toFixed(0)} ${ind.rsi14 > 55 ? "constructive" : ind.rsi14 < 45 ? "soft" : "neutral"}`);
  momentumBits.push(`stoch ${ind.stoch.k.toFixed(0)}/${ind.stoch.d.toFixed(0)}`);

  return {
    price,
    trend: signal.reading.bias,
    trendStrength: signal.reading.trendStrength,
    structure: structure.structure,
    structureNotes: structure.notes,
    momentum: momentumBits.join(" · "),
    volatility: { atrPct: Number(ind.atrPct.toFixed(2)), label: volatilityLabel(ind.atrPct) },
    volume: { ratio: Number(ind.volumeRatio.toFixed(2)), label: volumeLabel(ind.volumeRatio) },
    regime: regime.regime,
    regimeLabel: regime.label,
    supports,
    resistances,
    indicators: ind,
    keyLevelNote,
  };
}

/** Hierarchy weights — context timeframes dominate timing timeframes. */
const TF_WEIGHT: Record<Timeframe, number> = {
  "1m": 0.05,
  "5m": 0.08,
  "15m": 0.12,
  "1h": 0.17,
  "4h": 0.22,
  "1d": 0.21,
  "1w": 0.15,
};

export function aggregateBias(readings: TimeframeReading[]): {
  bias: Bias;
  score: number;
  explanation: string;
  alignment: number;
} {
  let weighted = 0;
  let totalWeight = 0;
  let bull = 0;
  let bear = 0;
  let neutral = 0;

  for (const r of readings) {
    const w = TF_WEIGHT[r.timeframe] ?? 0.1;
    weighted += r.score * w;
    totalWeight += w;
    if (r.bias === "bullish") bull++;
    else if (r.bias === "bearish") bear++;
    else neutral++;
  }

  const score = Math.round(totalWeight ? weighted / totalWeight : 0);
  const bias: Bias = score > 12 ? "bullish" : score < -12 ? "bearish" : "neutral";

  const dominant = readings
    .filter((r) => r.bias !== "neutral")
    .sort((a, b) => (TF_WEIGHT[b.timeframe] ?? 0) - (TF_WEIGHT[a.timeframe] ?? 0))
    .slice(0, 2);

  const alignment = Math.round((Math.max(bull, bear) / readings.length) * 100);

  const htfs = readings.filter((r) => ["4h", "1d", "1w"].includes(r.timeframe));
  const ltfs = readings.filter((r) => ["1m", "5m", "15m"].includes(r.timeframe));
  const htfBias = htfAve(htfs);
  const ltfBias = htfAve(ltfs);

  let explanation: string;
  if (alignment >= 70) {
    explanation = `${alignment}% of timeframes agree: ${dominant.map((d) => TIMEFRAME_LABEL[d.timeframe]).join(" and ")} carry the move, and the lower timeframes are not fighting it. The bias is ${bias}, and the main risk is a mature move rather than a wrong direction.`;
  } else if (htfBias !== "neutral" && ltfBias !== "neutral" && htfBias !== ltfBias) {
    explanation = `Conflict between horizons: higher timeframes (${["4h", "1d", "1w"]
      .filter((tf) => readings.find((r) => r.timeframe === tf)?.bias === htfBias)
      .map((tf) => TIMEFRAME_LABEL[tf as Timeframe])
      .join("/")}) lean ${htfBias}, while intraday leans ${ltfBias}. In this configuration the higher timeframe sets direction and the lower timeframe only sets timing — counter-trend intraday trades need a tighter invalidation and smaller size.`;
  } else if (alignment < 45) {
    explanation = `Timeframes disagree (${bull} bullish, ${bear} bearish, ${neutral} neutral), so there is no single directional edge. Bias is ${bias}: wait for a higher-timeframe close that resolves the conflict before committing risk.`;
  } else {
    explanation = `Mixed but slightly ${bias} (${alignment}% of timeframes aligned). The higher timeframes carry most of the weight, so treat counter-trend ideas as tactical and keep size below your default.`;
  }

  return { bias, score, explanation, alignment };
}

function htfAve(readings: TimeframeReading[]): Bias {
  if (!readings.length) return "neutral";
  const avg = readings.reduce((a, r) => a + r.score, 0) / readings.length;
  return avg > 10 ? "bullish" : avg < -10 ? "bearish" : "neutral";
}

export { clamp };
