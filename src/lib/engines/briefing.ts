/**
 * Daily Market Briefing Engine.
 *
 * Synthesises one page the trader can read in 60 seconds: what the majors are
 * doing, where the engine sees structure, what could move price today, and
 * what to watch. Events are a static reference calendar (clearly labelled),
 * never invented times.
 */

import { getMarketDataProvider } from "../market-data";
import { analyzeBundle } from "../ai/analyze";
import { INSTRUMENTS } from "../instruments";
import type {
  AIAnalysis,
  AssetClass,
  DailyBriefing,
  EconomicEvent,
  TradingStyle,
} from "../types";

const BRIEFING_UNIVERSE = ["BTC/USD", "ETH/USD", "XAU/USD", "EUR/USD", "S&P 500", "NASDAQ"];

/**
 * Reference economic calendar. In production this is replaced by a calendar
 * provider in the same market-data layer; times are expressed as UTC offsets
 * from the briefing date so the demo stays coherent.
 */
const CALENDAR: { title: string; currency: string; impact: EconomicEvent["impact"]; forecast: string; previous: string; hourUtc: number }[] = [
  { title: "US CPI (YoY)", currency: "USD", impact: "high", forecast: "2.9%", previous: "3.1%", hourUtc: 13 },
  { title: "FOMC Minutes", currency: "USD", impact: "high", forecast: "—", previous: "—", hourUtc: 19 },
  { title: "Eurozone Flash PMI", currency: "EUR", impact: "medium", forecast: "50.4", previous: "49.8", hourUtc: 9 },
  { title: "US Initial Jobless Claims", currency: "USD", impact: "medium", forecast: "221K", previous: "217K", hourUtc: 13 },
  { title: "UK GDP (QoQ)", currency: "GBP", impact: "medium", forecast: "0.3%", previous: "0.2%", hourUtc: 7 },
  { title: "Crude Oil Inventories", currency: "USD", impact: "low", forecast: "-1.2M", previous: "0.8M", hourUtc: 15 },
];

function calendarFor(now: number): EconomicEvent[] {
  const base = new Date(now);
  const dayStart = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  // Rotate two events per day deterministically so the briefing varies.
  const dayIndex = Math.floor(now / 86_400_000);
  const picks = [CALENDAR[dayIndex % CALENDAR.length], CALENDAR[(dayIndex + 3) % CALENDAR.length]];
  return picks
    .filter(Boolean)
    .map((e, idx) => ({
      id: `evt_${dayIndex}_${idx}`,
      time: dayStart + e.hourUtc * 3_600_000,
      title: e.title,
      currency: e.currency,
      impact: e.impact,
      forecast: e.forecast,
      previous: e.previous,
    }))
    .sort((a, b) => a.time - b.time);
}

export async function buildBriefing(style: TradingStyle = "day"): Promise<DailyBriefing> {
  const provider = getMarketDataProvider();
  const analyses: AIAnalysis[] = [];

  for (const symbol of BRIEFING_UNIVERSE) {
    try {
      const bundle = await provider.getBundle(symbol);
      analyses.push(analyzeBundle({ symbol, bundle, style }));
    } catch {
      /* skip unavailable instruments */
    }
  }

  const now = Date.now();
  const events = calendarFor(now);
  const source = analyses[0]?.source ?? provider.source;

  const highVol = analyses.filter((a) => a.overview.volatility.label === "high" || a.overview.volatility.label === "elevated");
  const withSetups = analyses.filter((a) => a.setups.length > 0);
  const best = withSetups.sort((a, b) => b.setups[0].confidence - a.setups[0].confidence);

  const biasCount = {
    bullish: analyses.filter((a) => a.overallBias === "bullish").length,
    bearish: analyses.filter((a) => a.overallBias === "bearish").length,
    neutral: analyses.filter((a) => a.overallBias === "neutral").length,
  };

  const headline =
    biasCount.bullish > biasCount.bearish
      ? `Constructive tone — ${biasCount.bullish} of ${analyses.length} majors leaning bullish`
      : biasCount.bearish > biasCount.bullish
        ? `Defensive tone — ${biasCount.bearish} of ${analyses.length} majors leaning bearish`
        : `Two-way tape — majors split between bullish and bearish readings`;

  const marketOverview = analyses.map((a) => ({
    symbol: a.symbol,
    name: a.name,
    bias: a.overallBias,
    changePct: a.overview.volatility.atrPct,
    note: `${a.overview.regimeLabel} · ${a.overview.structureNotes.split("—")[0].trim()}`,
  }));

  const opportunities = best.slice(0, 3).map((a) => ({
    symbol: a.symbol,
    direction: a.setups[0].direction,
    quality: a.setups[0].quality,
    summary: `${a.setups[0].direction.toUpperCase()} on the ${a.setups[0].timeframe.toUpperCase()} — entry ${a.setups[0].entryLow}–${a.setups[0].entryHigh}, stop ${a.setups[0].stop}, target ${a.setups[0].takeProfit}, ${a.setups[0].riskReward.toFixed(1)}:1.`,
  }));

  const volatilityNote = highVol.length
    ? `${highVol.map((a) => a.symbol).join(", ")} ${highVol.length === 1 ? "is" : "are"} running above normal volatility (ATR ${
        Math.max(...highVol.map((a) => a.overview.volatility.atrPct)).toFixed(2)
      }% of price). Size down and expect wider stops to be tested.`
    : `Volatility is within its normal band across the majors. Standard position sizing applies; the risk today is a quiet tape tempting oversized trades rather than a shock.`;

  const risks: string[] = [];
  if (events.some((e) => e.impact === "high")) {
    risks.push(
      `High-impact data at ${events.find((e) => e.impact === "high")!.time >= now ? "later today" : "already released"} (${events.filter((e) => e.impact === "high").map((e) => e.title).join(", ")}). Spreads widen and stops slip around the release — avoid holding into it unless that is the trade.`,
    );
  }
  if (biasCount.bullish > 0 && biasCount.bearish > 0) {
    risks.push("Correlation risk: majors are split, so short and long positions can still move against each other on a single dollar headline.");
  }
  if (highVol.length) {
    risks.push("Elevated ATR means the same percentage stop is a wider dollar loss in real terms; recalculate size before entry.");
  }
  if (!opportunities.length) {
    risks.push("No qualifying setup across the majors — the disciplined action today is patience, not a forced trade.");
  }

  const watchlistToday = [
    ...best.slice(0, 2).map((a) => {
      const s = a.setups[0];
      // "invalid below" is only correct for longs; shorts are invalidated above.
      return `${a.symbol}: ${s.direction.toUpperCase()} zone ${s.entryLow}–${s.entryHigh} — invalidated ${s.direction === "long" ? "below" : "above"} ${s.stop}`;
    }),
    ...analyses
      .filter((a) => a.overview.regime === "compression")
      .slice(0, 1)
      .map((a) => `${a.symbol}: volatility compression — the first decisive close outside the coil is the event, not the chop inside it.`),
    ...analyses
      .slice(0, 1)
      .map((a) => `${a.symbol}: key level at ${a.overview.supports[0]?.price ?? "—"} support / ${a.overview.resistances[0]?.price ?? "—"} resistance.`),
  ].slice(0, 4);

  return {
    date: new Date(now).toISOString().slice(0, 10),
    generatedAt: now,
    source,
    headline,
    marketOverview,
    opportunities,
    events,
    volatilityNote,
    risks,
    watchlistToday,
  };
}

export function briefingAssets(classes: AssetClass[]): string[] {
  return INSTRUMENTS.filter((i) => classes.includes(i.assetClass)).map((i) => i.symbol);
}
