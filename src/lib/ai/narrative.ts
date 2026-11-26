/**
 * Narrative layer.
 *
 * Turns structured analyzer output into prose a trader can read quickly.
 * Deterministic by default; an optional LLM may only *rephrase* the structured
 * facts (see `polishNarrative`). No numbers are invented here.
 */

import { fmtPrice } from "../format";
import type {
  AIAnalysis,
  AnalysisScenario,
  Bias,
  MarketOverview,
  MarketRegime,
  SetupQuality,
  Timeframe,
  TimeframeReading,
  TradeSetup,
  TradingStyle,
} from "../types";
import { TIMEFRAME_LABEL } from "../types";

const BIAS_WORD: Record<Bias, string> = {
  bullish: "bullish",
  bearish: "bearish",
  neutral: "neutral",
};

export function buildScenarios(args: {
  overview: MarketOverview;
  aggregate: { bias: Bias; score: number; alignment: number };
  regime: { regime: MarketRegime; label: string };
  timeframe: Timeframe;
}): AnalysisScenario[] {
  const { overview, aggregate, regime, timeframe } = args;
  const tf = TIMEFRAME_LABEL[timeframe];
  const nearestRes = overview.resistances[0]?.price;
  const nearestSup = overview.supports[0]?.price;
  const scenarios: AnalysisScenario[] = [];

  if (aggregate.bias === "bullish") {
    scenarios.push({
      name: "Continuation higher",
      probability: "most likely",
      summary: `Price holds above ${nearestSup ? fmtPrice(nearestSup) : "dynamic support"} and extends toward the next resistance. Buyers defend pullbacks rather than chasing highs.`,
      triggers: `A ${tf} close back above the prior swing high with volume above its 20-bar average.`,
    });
    scenarios.push({
      name: "Deep pullback, trend intact",
      probability: "alternative",
      summary: `Momentum cools and price retraces into the ${nearestSup ? fmtPrice(nearestSup) : "nearest support"} shelf. The trend only becomes suspect if that shelf fails on a closing basis.`,
      triggers: `Rejection wick into support followed by a higher low on the ${tf}.`,
    });
    scenarios.push({
      name: "Trend failure",
      probability: "low probability",
      summary: `A decisive close below the ${nearestSup ? fmtPrice(nearestSup) : "support"} level converts the structure to lower highs and lower lows, invalidating the bullish map.`,
      triggers: `Close below support with expanding volume, then a failed retest from underneath.`,
    });
  } else if (aggregate.bias === "bearish") {
    scenarios.push({
      name: "Continuation lower",
      probability: "most likely",
      summary: `Rallies are sold into below ${nearestRes ? fmtPrice(nearestRes) : "dynamic resistance"}, with price probing the next support shelf.`,
      triggers: `A ${tf} rejection at resistance with MACD histogram staying negative.`,
    });
    scenarios.push({
      name: "Relief bounce",
      probability: "alternative",
      summary: `Short covering lifts price toward ${nearestRes ? fmtPrice(nearestRes) : "resistance"} without changing the higher-timeframe structure. This is where amateur shorts get stopped.`,
      triggers: `Two consecutive ${tf} closes above the 20 EMA while ADX stays below 25.`,
    });
    scenarios.push({
      name: "Bearish exhaustion",
      probability: "low probability",
      summary: `A climactic volume spike and a long lower wick mark capitulation, turning the regime into a range or reversal.`,
      triggers: `RSI below 25 followed by a ${tf} close back above the previous low.`,
    });
  } else {
    scenarios.push({
      name: "Range persists",
      probability: "most likely",
      summary: `Price oscillates between ${nearestSup ? fmtPrice(nearestSup) : "support"} and ${nearestRes ? fmtPrice(nearestRes) : "resistance"}. The middle of the range is the worst place to enter.`,
      triggers: `Repeated rejection at both edges with ADX under 20.`,
    });
    scenarios.push({
      name: "Breakout from ${regime.label}".replace("${regime.label}", regime.label.toLowerCase()),
      probability: "alternative",
      summary:
        regime.regime === "compression"
          ? `The coil resolves and volatility expands. Direction is confirmed by the first close outside the range, not the first wick.`
          : `One edge breaks and price trends toward the next higher-timeframe level.`,
      triggers: `A close outside the range with volume at least 1.5× the 20-bar average, then a successful retest.`,
    });
    scenarios.push({
      name: "Liquidity sweep",
      probability: "low probability",
      summary: `Stops beyond one edge are taken before price reverses back into the range — a classic false breakout.`,
      triggers: `Wick beyond the range boundary with an immediate close back inside.`,
    });
  }

  return scenarios;
}

export function collectRiskNotes(args: {
  overview: MarketOverview;
  regime: { regime: MarketRegime; label: string; explanation: string };
  setups: TradeSetup[];
  readings: TimeframeReading[];
}): string[] {
  const { overview, regime, setups, readings } = args;
  const notes: string[] = [];

  notes.push(regime.explanation);

  const conflict = readings.filter((r) => r.bias !== "neutral");
  const bulls = conflict.filter((r) => r.bias === "bullish").length;
  const bears = conflict.filter((r) => r.bias === "bearish").length;
  if (bulls > 0 && bears > 0) {
    notes.push(
      `Timeframe conflict (${bulls} bullish vs ${bears} bearish) raises whipsaw risk. Counter-trend entries need a tighter stop and half size.`,
    );
  }

  if (overview.volatility.label === "high" || overview.volatility.label === "elevated") {
    notes.push(
      `ATR is ${overview.volatility.atrPct.toFixed(2)}% of price (${overview.volatility.label}). Stops placed inside one ATR have a high probability of being swept by noise alone.`,
    );
  }
  if (overview.volume.label === "climactic") {
    notes.push(
      "Volume is climactic (over 2× average). Climactic volume often marks exhaustion or a news event — wait for the bar to close before acting.",
    );
  }
  if (overview.volume.label === "thin") {
    notes.push("Volume is thin, so slippage on stops is likely and breakouts have a higher failure rate.");
  }
  if (overview.indicators.rsi14 > 72) {
    notes.push("RSI above 72: the move is extended. New longs here accept reversion risk against you.");
  }
  if (overview.indicators.rsi14 < 28) {
    notes.push("RSI below 28: oversold is a condition, not a signal. Wait for a higher low before buying.");
  }
  if (!setups.length) {
    notes.push("No setup meets the confluence bar right now. Standing aside is a position — the engine will re-scan on the next data refresh.");
  }

  return notes;
}

const QUALITY_COPY: Record<SetupQuality, string> = {
  high: "high confluence",
  medium: "moderate confluence",
  low: "low confluence — watchlist candidate",
};

export function buildNarrative(args: {
  symbol: string;
  name: string;
  overview: MarketOverview;
  aggregate: { bias: Bias; score: number; alignment: number; explanation: string };
  regime: { label: string; explanation: string };
  readings: TimeframeReading[];
  setups: TradeSetup[];
  timeframe: Timeframe;
  demo: boolean;
  style: TradingStyle;
}): string {
  const { symbol, name, overview, aggregate, regime, readings, setups, timeframe } = args;
  const tf = TIMEFRAME_LABEL[timeframe];
  const parts: string[] = [];

  parts.push(
    `${name} (${symbol}) is ${BIAS_WORD[aggregate.bias]} on the ${tf} read at ${fmtPrice(overview.price, symbol)}.`,
  );

  parts.push(
    `Regime: ${regime.label.toLowerCase()}. ${overview.structureNotes} Trend strength reads ${overview.trendStrength}/100 with ${overview.indicators.adx.toFixed(0)} ADX.`,
  );

  const bullTfs = readings.filter((r) => r.bias === "bullish").map((r) => TIMEFRAME_LABEL[r.timeframe]);
  const bearTfs = readings.filter((r) => r.bias === "bearish").map((r) => TIMEFRAME_LABEL[r.timeframe]);
  if (bullTfs.length || bearTfs.length) {
    parts.push(
      `Across timeframes: ${bullTfs.length ? `${bullTfs.join(", ")} bullish` : "no bullish readings"}${
        bearTfs.length ? `; ${bearTfs.join(", ")} bearish` : "; no bearish readings"
      }. ${aggregate.explanation}`,
    );
  }

  parts.push(overview.keyLevelNote);

  if (setups.length) {
    const best = setups[0];
    parts.push(
      `The clearest opportunity is a ${best.direction.toUpperCase()} on the ${TIMEFRAME_LABEL[best.timeframe]} (${QUALITY_COPY[best.quality]}): entry ${fmtPrice(best.entryLow, symbol)}–${fmtPrice(best.entryHigh, symbol)}, stop ${fmtPrice(best.stop, symbol)}, first target ${fmtPrice(best.takeProfit, symbol)} for ${best.riskReward.toFixed(1)}:1 reward-to-risk. AI-estimated confidence ${best.confidence}/100 based on available market data.`,
    );
  } else {
    parts.push(
      "No directional setup currently clears the confluence threshold. That is a legitimate outcome: the engine does not manufacture signals to appear useful.",
    );
  }

  parts.push(
    "This is market analysis and educational information, not investment advice. TRADIA AI provides analysis based on available market data and does not guarantee trading results.",
  );

  return parts.join("\n\n");
}

/**
 * Optional LLM polish. When AI_PROVIDER is an OpenAI-compatible endpoint we
 * ask it to rewrite the deterministic narrative — it is explicitly barred from
 * adding facts, and we fall back to the deterministic text on any problem.
 */
export async function polishNarrative(
  deterministic: string,
  _facts: { symbol: string; bias: string; regimes: string[]; setups: number },
): Promise<{ text: string; engine: string }> {
  const provider = (process.env.AI_PROVIDER ?? "engine").toLowerCase();
  const key = process.env.AI_API_KEY;
  if (provider === "engine" || !key) return { text: deterministic, engine: "tradia-engine-v1.4" };

  try {
    const res = await fetch(`${process.env.AI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are TRADIA AI's market analyst. Rewrite the supplied analysis for clarity and flow. Rules: never invent, change or add any number, price, level, percentage or timeframe; never promise profits, accuracy or certainty; keep the risk and invalidation information; keep it under 260 words; plain prose, no markdown headings.",
          },
          { role: "user", content: deterministic },
        ],
      }),
    });
    if (!res.ok) return { text: deterministic, engine: "tradia-engine-v1.4" };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text || text.length < 120) return { text: deterministic, engine: "tradia-engine-v1.4" };
    // Guard: reject output that introduces numbers absent from the source.
    const sourceNumbers = new Set(deterministic.match(/\d+(\.\d+)?/g) ?? []);
    const novelNumbers = (text.match(/\d+(\.\d+)?/g) ?? []).filter((n) => !sourceNumbers.has(n));
    if (novelNumbers.length > 2) return { text: deterministic, engine: "tradia-engine-v1.4" };
    return { text, engine: `tradia-engine-v1.4+${process.env.AI_MODEL ?? "llm"}` };
  } catch {
    return { text: deterministic, engine: "tradia-engine-v1.4" };
  }
}

/** One-line summary used in cards and scan rows. */
export function shortSummary(analysis: AIAnalysis): string {
  const best = analysis.setups[0];
  const bias = BIAS_WORD[analysis.overallBias];
  if (!best) return `${bias} bias · ${analysis.overview.regimeLabel.toLowerCase()} · no qualifying setup`;
  return `${bias} bias · ${best.direction.toUpperCase()} ${TIMEFRAME_LABEL[best.timeframe]} ${QUALITY_COPY[best.quality]}`;
}
