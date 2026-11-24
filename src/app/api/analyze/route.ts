import { z } from "zod";
import { analyzeBundle, anchorTimeframeFor } from "@/lib/ai/analyze";
import { polishNarrative } from "@/lib/ai/narrative";
import { getMarketDataProvider } from "@/lib/market-data";
import { entitlementsFor, PlanLimitError, consume } from "@/lib/plan";
import { getInstrument } from "@/lib/instruments";
import { cacheAnalysis, fail, json, withUser } from "@/lib/api-helpers";
import { getWatchlist } from "@/lib/db/repo";
import { type Timeframe, type TradingStyle } from "@/lib/types";

const schema = z.object({
  symbol: z.string().min(1).max(24),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]).optional(),
  style: z.enum(["scalping", "day", "swing", "longterm"]).optional(),
  /** Set by the client to avoid burning quota when silently refreshing. */
  cached: z.boolean().optional(),
});

export async function POST(request: Request) {
  return withUser(async (user) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail("Choose an instrument to analyse.", 422, "VALIDATION");

    const { symbol } = parsed.data;
    if (!getInstrument(symbol)) return fail(`Unknown instrument: ${symbol}`, 404, "UNKNOWN_SYMBOL");

    const ent = entitlementsFor(user.plan);
    const style: TradingStyle = parsed.data.style ?? user.preferences.style;
    const timeframe: Timeframe = parsed.data.timeframe ?? anchorTimeframeFor(style);

    // Metering: an explicit analysis costs one unit; a cached refresh does not.
    if (!parsed.data.cached) {
      const quota = consume(user.id, user.plan, "analysis");
      if (!quota.allowed) throw new PlanLimitError(quota.message ?? "Daily limit reached", quota.used, quota.limit);
    }

    const provider = getMarketDataProvider();
    const bundle = await provider.getBundle(symbol);

    const analysis = analyzeBundle({
      symbol,
      bundle,
      style,
      timeframe,
      maxTimeframes: ent.timeframeDepth,
    });

    // Optional LLM phrasing — guarded so it can never alter the numbers.
    if (ent.advancedScenarios) {
      const polished = await polishNarrative(analysis.narrative, {
        symbol,
        bias: analysis.overallBias,
        regimes: [analysis.overview.regime],
        setups: analysis.setups.length,
      });
      analysis.narrative = polished.text;
      analysis.engine = polished.engine;
    }

    cacheAnalysis(symbol, analysis);
    cacheAnalysis(`${symbol}:${timeframe}`, analysis);

    return json({
      analysis,
      entitlements: ent,
      watchlist: getWatchlist(user.id),
      availableTimeframes: analysis.timeframes.map((t) => t.timeframe),
      hiddenTimeframes: analysis.hiddenTimeframes,
    });
  });
}

export async function GET(request: Request) {
  return withUser(async () => {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol");
    if (!symbol || !getInstrument(symbol)) return fail("Provide a valid ?symbol=", 422, "VALIDATION");
    const provider = getMarketDataProvider();
    const quote = await provider.getQuote(symbol);
    return json({ quote });
  });
}
