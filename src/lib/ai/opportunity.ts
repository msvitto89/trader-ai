/**
 * Opportunity Detector.
 *
 * Builds structured, explainable setups from the analyzer output. Rules:
 *  - Never emit a setup without a stop and an explicit invalidation.
 *  - Quality reflects confluence, not conviction marketing.
 *  - The entry is an actionable *zone*, not a single magic price.
 *  - Risk/reward is computed from the stop, never asserted.
 */

import { requireInstrument } from "../instruments";
import { roundTo } from "../format";
import type {
  Candle,
  Direction,
  IndicatorSnapshot,
  Level,
  MarketOverview,
  SetupQuality,
  SetupReason,
  TradeSetup,
  TradingStyle,
  Timeframe,
} from "../types";
import { TIMEFRAME_LABEL } from "../types";
import type { TimeframeReading } from "../types";

export interface SetupContext {
  symbol: string;
  candles: Candle[];
  timeframe: Timeframe;
  style: TradingStyle;
  overview: MarketOverview;
  readings: TimeframeReading[];
  overallBias: "bullish" | "bearish" | "neutral";
  demo: boolean;
  now: number;
  /** Minimum risk/reward the strategy requires. */
  minRR?: number;
}

const STYLE_TIMEFRAMES: Record<TradingStyle, Timeframe[]> = {
  scalping: ["5m", "15m", "1h"],
  day: ["15m", "1h", "4h"],
  swing: ["4h", "1d", "1w"],
  longterm: ["1d", "1w"],
};

export function preferredTimeframes(style: TradingStyle): Timeframe[] {
  return STYLE_TIMEFRAMES[style];
}

function targetRRFor(style: TradingStyle): number {
  switch (style) {
    case "scalping":
      return 1.6;
    case "day":
      return 2.2;
    case "swing":
      return 2.8;
    case "longterm":
      return 3.4;
  }
}

function scoreQuality(
  confluence: number,
  rr: number,
  regimeTradeable: boolean,
  regime: MarketOverview["regime"],
): SetupQuality {
  let p = confluence;
  if (rr < 1.5) p -= 2;
  else if (rr >= 2.5) p += 1;
  if (!regimeTradeable) p -= 2;
  // A range cannot produce a high-confluence trend setup — claiming otherwise
  // is the single most common way a signal service loses credibility.
  const cap = regime === "ranging" || regime === "high-volatility" ? "medium" : "high";
  if (p >= 8) return cap;
  if (p >= 5) return "medium";
  return "low";
}

/** Convert a confluence score into a calibrated confidence band. */
function scoreConfidence(confluence: number, quality: SetupQuality): number {
  const base = quality === "high" ? 58 : quality === "medium" ? 45 : 30;
  return Math.max(22, Math.min(79, base + confluence * 1.6));
}

export function detectSetups(ctx: SetupContext): TradeSetup[] {
  const { candles, timeframe, style, overview, readings, overallBias } = ctx;
  if (candles.length < 60) return [];

  const price = candles[candles.length - 1].c;
  const ind: IndicatorSnapshot = overview.indicators;
  const atr = ind.atr14 || price * 0.01;
  const precision = requireInstrument(ctx.symbol).precision;

  const tfReading = readings.find((r) => r.timeframe === timeframe);
  if (!tfReading) return [];

  // Direction requires agreement between the higher-timeframe bias and this TF.
  let direction: Direction | null = null;
  if (tfReading.bias === "bullish" && overallBias !== "bearish") direction = "long";
  else if (tfReading.bias === "bearish" && overallBias !== "bullish") direction = "short";
  else if (tfReading.bias !== "neutral" && tfReading.score * Math.sign(overallBias === "bullish" ? 1 : -1) > 0) {
    direction = tfReading.bias === "bullish" ? "long" : "short";
  }
  if (!direction) return [];

  const isLong = direction === "long";
  const regimeTradeable = overview.regime !== "ranging" || Math.abs(tfReading.score) > 30;

  // ── Confluence accounting ─────────────────────────────────────
  const reasons: SetupReason[] = [];
  let confluence = 0;

  const alignedTfs = readings.filter(
    (r) => r.bias === (isLong ? "bullish" : "bearish"),
  );
  confluence += Math.min(3, alignedTfs.length);
  reasons.push({
    label: "Trend alignment",
    detail: `${alignedTfs.length} of ${readings.length} timeframes agree with the ${direction} side${
      alignedTfs.length >= 4 ? " — this is the strongest part of the setup" : ""
    }. The ${TIMEFRAME_LABEL[timeframe]} reading scores ${tfReading.score > 0 ? "+" : ""}${tfReading.score}.`,
  });

  const structureSupports =
    (isLong && overview.structure === "higher-highs-higher-lows") ||
    (!isLong && overview.structure === "lower-highs-lower-lows");
  if (structureSupports) {
    confluence += 2;
    reasons.push({ label: "Market structure", detail: overview.structureNotes });
  } else {
    reasons.push({
      label: "Market structure",
      detail: `${overview.structureNotes} Structure does not fully confirm this direction, so treat the setup as tactical.`,
    });
  }

  const momentumAligned = isLong ? ind.macd.histogram > 0 && ind.rsi14 > 48 : ind.macd.histogram < 0 && ind.rsi14 < 52;
  if (momentumAligned) {
    confluence += 2;
    reasons.push({
      label: "Momentum",
      detail: `MACD histogram is ${ind.macd.histogram > 0 ? "positive" : "negative"} and RSI is ${ind.rsi14.toFixed(0)}. Momentum on the ${TIMEFRAME_LABEL[timeframe]} is ${isLong ? "with buyers" : "with sellers"}.`,
    });
  } else {
    reasons.push({
      label: "Momentum",
      detail: `Momentum is not yet confirming: MACD histogram ${ind.macd.histogram > 0 ? "positive" : "negative"}, RSI ${ind.rsi14.toFixed(0)}. This is the weakest link in the setup.`,
    });
  }

  const volumeConfirms = ind.volumeRatio > 1.15;
  if (volumeConfirms) {
    confluence += 1;
    reasons.push({
      label: "Volume",
      detail: `Volume is running ${(ind.volumeRatio * 100 - 100).toFixed(0)}% above its 20-bar average, which supports follow-through rather than a fake-out.`,
    });
  } else {
    reasons.push({
      label: "Volume",
      detail: `Volume is ${ind.volumeRatio < 1 ? "at or below" : "only modestly above"} its 20-bar average — participation is not exceptional, so avoid adding to the position early.`,
    });
  }

  // ── Entry / stop / target construction ────────────────────────
  const supportLevels = overview.supports;
  const resistanceLevels = overview.resistances;

  // Entry is always a *pullback* zone relative to current price, and it is
  // clamped to a sane distance so higher timeframes cannot place an entry
  // miles away from the market. A long buys below price, a short sells above.
  const emaPullback = isLong ? Math.min(ind.ema20, ind.ema50) : Math.max(ind.ema20, ind.ema50);
  // Bounds combine volatility (ATR) with a price-relative ceiling so very high
  // timeframes cannot ask for an entry that is absurdly far from the market.
  const maxPullPct = style === "scalping" ? 0.004 : style === "day" ? 0.012 : style === "swing" ? 0.028 : 0.045;
  const minPullPct = style === "scalping" ? 0.0006 : 0.0015;
  const maxPull = Math.max(atr * 0.4, Math.min(atr * 1.2, price * maxPullPct));
  const minPull = Math.min(atr * 0.3, price * minPullPct);
  const rawOffset = emaPullback - price; // negative for a long
  const desiredOffset = isLong
    ? Math.max(-maxPull, Math.min(-minPull, rawOffset))
    : Math.min(maxPull, Math.max(minPull, rawOffset));
  const zoneCentre = price + desiredOffset;

  // Zone width scales with timeframe noise but stays tight enough to be meaningful.
  const zoneHalf = Math.max(atr * 0.16, price * 0.0008);
  const entryLow = Math.min(zoneCentre - zoneHalf, zoneCentre + zoneHalf);
  const entryHigh = Math.max(zoneCentre - zoneHalf, zoneCentre + zoneHalf);

  // ── Stop: behind the structural swing, with a volatility floor/ceiling ──
  const swingLow = Math.min(...candles.slice(-25).map((c) => c.l));
  const swingHigh = Math.max(...candles.slice(-25).map((c) => c.h));
  // Stop distance is bounded by volatility *and* by a price-relative ceiling,
  // which keeps R multiples realistic across instruments and timeframes.
  const maxStopPct = style === "scalping" ? 0.006 : style === "day" ? 0.02 : style === "swing" ? 0.045 : 0.07;
  const minStopDist = Math.max(atr * (style === "scalping" ? 0.55 : 0.8), price * 0.0012);
  const maxStopDist = Math.min(atr * (style === "scalping" ? 2.4 : 3.4), price * maxStopPct);
  const rawStopDist = isLong
    ? entryLow - Math.min(swingLow, entryLow) + atr * 0.3
    : Math.max(swingHigh, entryHigh) - entryHigh + atr * 0.3;
  const stopDist = Math.max(minStopDist, Math.min(Math.max(minStopDist, maxStopDist), rawStopDist));
  const stop = isLong ? entryLow - stopDist : entryHigh + stopDist;

  // Guard: stop must sit on the correct side and be a real distance away.
  if (!Number.isFinite(stop)) return [];
  if (isLong ? stop >= entryLow : stop <= entryHigh) return [];

  // One reference entry for every calculation. Using the zone midpoint keeps
  // the published reward/risk reproducible from the published levels.
  const entryRef = (entryLow + entryHigh) / 2;
  const riskPerUnit = Math.abs(entryRef - stop);
  if (!(riskPerUnit > 0)) return [];
  const minRR = ctx.minRR ?? targetRRFor(style);

  // First target: nearest opposing level beyond the entry, if it gives enough R.
  const opposing: Level[] = isLong ? resistanceLevels : supportLevels;
  const levelTarget = opposing
    .filter((l) => (isLong ? l.price > entryRef + riskPerUnit * 1.2 : l.price < entryRef - riskPerUnit * 1.2))
    .sort((a, b) => (isLong ? a.price - b.price : b.price - a.price))[0];

  const structuralRR = levelTarget ? Math.abs(levelTarget.price - entryRef) / riskPerUnit : 0;
  const takeProfitPrice =
    levelTarget && structuralRR >= minRR * 0.85 && structuralRR <= minRR * 3
      ? levelTarget.price
      : isLong
        ? entryRef + riskPerUnit * minRR
        : entryRef - riskPerUnit * minRR;

  const rr = Math.abs(takeProfitPrice - entryRef) / riskPerUnit;
  if (!(rr > 0) || !Number.isFinite(rr) || takeProfitPrice <= 0) return [];
  if (rr >= 1.5) confluence += 1;

  reasons.push({
    label: "Key price level",
    detail: levelTarget
      ? `${levelTarget.kind === "resistance" ? "Resistance" : "Support"} at ${roundTo(levelTarget.price, precision)} has ${levelTarget.touches} swing ${levelTarget.touches === 1 ? "touch" : "touches"} and sets the first objective. ${isLong ? "Support" : "Resistance"} at ${roundTo(isLong ? (supportLevels[0]?.price ?? stop) : (resistanceLevels[0]?.price ?? stop), precision)} is the level that matters for invalidation.`
      : `No clean opposing level sits within the target window, so the target is derived from the ${minRR.toFixed(1)}R objective measured from the stop.`,
  });

  // Maturity penalty: a move that is already extended is a worse entry even
  // when every timeframe agrees. This is what stops the engine from cheering
  // at the top of a trend.
  const extensionAtr = Math.abs(price - ind.ema20) / atr;
  if (extensionAtr > 1.6) {
    confluence -= 1;
    reasons.push({
      label: "Extension",
      detail: `Price is already ${extensionAtr.toFixed(1)}× ATR from the 20 EMA — the move is mature. Entering now means paying up, so the entry zone is a pullback limit rather than a market order.`,
    });
  }
  if (ind.rsi14 > 72 || ind.rsi14 < 28) {
    confluence -= 1;
  }

  const quality = scoreQuality(confluence, rr, regimeTradeable, overview.regime);
  if (quality === "low" && !ctx.style) return [];

  const invalidatedIf: string[] = [];
  invalidatedIf.push(
    isLong
      ? `A close below ${roundTo(stop, precision)} on the ${TIMEFRAME_LABEL[timeframe]} — this takes out the protective stop and breaks the swing low the setup depends on.`
      : `A close above ${roundTo(stop, precision)} on the ${TIMEFRAME_LABEL[timeframe]} — this takes out the protective stop and breaks the swing high the setup depends on.`,
  );
  invalidatedIf.push(
    isLong
      ? `Market structure shifting to lower highs and lower lows before the entry zone is reached.`
      : `Market structure shifting to higher highs and higher lows before the entry zone is reached.`,
  );
  invalidatedIf.push(
    `Volume drying up below 70% of its 20-bar average on the breakout — without participation the move is likely to stall.`,
  );

  const riskNote =
    quality === "high"
      ? `Risk is defined at ${roundTo(stop, precision)}. With a ${rr.toFixed(1)}:1 reward-to-risk, risking a standard 1% of the account means losing 1% if wrong and making ~${rr.toFixed(1)}% if right — the setup can be wrong more than half the time and still be profitable.`
      : quality === "medium"
        ? `Only partial confluence. Size this below your default risk (0.5% or less) and do not add while momentum is unconfirmed.`
        : `Low confluence — this is a watchlist idea, not a trade. Note the levels, wait for confirmation, and skip it if the entry zone is missed.`;

  const id = `setup_${ctx.symbol.replace(/[^A-Z0-9]/gi, "")}_${timeframe}_${Math.floor(ctx.now / 300_000)}_${direction}`;

  const setup: TradeSetup = {
    id,
    symbol: ctx.symbol,
    assetClass: requireInstrument(ctx.symbol).assetClass,
    direction,
    timeframe,
    style,
    entryLow: roundTo(entryLow, precision),
    entryHigh: roundTo(entryHigh, precision),
    stop: roundTo(stop, precision),
    takeProfit: roundTo(takeProfitPrice, precision),
    riskReward: Number(rr.toFixed(2)),
    quality,
    regime: overview.regime,
    regimeLabel: overview.regimeLabel,
    confidence: Math.round(scoreConfidence(confluence, quality)),
    score: tfReading.score,
    rationale: reasons,
    invalidatedIf,
    riskNote,
    createdAt: ctx.now,
    referencePrice: price,
    demo: ctx.demo,
    status: "open",
  };

  return [setup];
}

/** Score a scan row headline from the setup + overview. */
export function setupHeadline(setup: TradeSetup | null, bias: string, regime: string): string {
  if (!setup) return `No actionable setup — ${bias} bias in a ${regime} regime`;
  const dir = setup.direction === "long" ? "Long" : "Short";
  const q = setup.quality === "high" ? "high-confluence" : setup.quality === "medium" ? "moderate-confluence" : "low-confluence";
  return `${dir} ${q} setup · ${setup.riskReward.toFixed(1)}:1 R/R`;
}

/** Re-evaluate whether an open setup was invalidated by new price action. */
export function validateSetup(setup: TradeSetup, price: number, atr: number, now: number): TradeSetup["status"] {
  const ageHours = (now - setup.createdAt) / 3_600_000;
  const maxAge = setup.timeframe === "1m" ? 2 : setup.timeframe === "5m" ? 6 : setup.timeframe === "15m" ? 18 : setup.timeframe === "1h" ? 48 : setup.timeframe === "4h" ? 168 : 720;
  if (ageHours > maxAge) return "expired";
  if (setup.direction === "long") {
    if (price < setup.stop - atr * 0.1) return "invalidated";
    if (price <= setup.entryHigh && price >= setup.entryLow) return "triggered";
  } else {
    if (price > setup.stop + atr * 0.1) return "invalidated";
    if (price >= setup.entryLow && price <= setup.entryHigh) return "triggered";
  }
  return "open";
}
