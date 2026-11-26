import { getMarketDataProvider } from "@/lib/market-data";
import { fail, json, withUser } from "@/lib/api-helpers";
import { getInstrument } from "@/lib/instruments";
import { computeIndicators, findLevels } from "@/lib/indicators";
import { TIMEFRAMES, type Timeframe } from "@/lib/types";

/**
 * Candle series for the chart. Returns indicators and levels computed
 * server-side so the client chart only has to draw.
 */
export async function GET(request: Request) {
  return withUser(async () => {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol");
    const timeframe = (url.searchParams.get("timeframe") ?? "1h") as Timeframe;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 300), 600);

    if (!symbol || !getInstrument(symbol)) return fail("Provide a valid ?symbol=", 422, "VALIDATION");
    if (!TIMEFRAMES.includes(timeframe)) return fail("Unsupported timeframe.", 422, "VALIDATION");

    const provider = getMarketDataProvider();
    const candles = await provider.getSeries(symbol, timeframe, limit);
    const price = candles[candles.length - 1]?.c ?? 0;
    const indicators = computeIndicators(candles);
    const levels = findLevels(candles, price, indicators.atr14 || price * 0.01);

    return json({
      symbol,
      timeframe,
      candles,
      indicators,
      levels: levels.slice(0, 6),
      source: provider.source,
      provider: provider.label,
      asOf: candles[candles.length - 1]?.t ?? Date.now(),
    });
  });
}
