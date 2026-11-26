import { getMarketDataProvider } from "@/lib/market-data";
import { describeMarketData } from "@/lib/market-data";
import { fail, json, withUser } from "@/lib/api-helpers";
import { getInstrument } from "@/lib/instruments";
import { validateSetup } from "@/lib/ai/opportunity";
import type { TradeSetup } from "@/lib/types";

/**
 * Lightweight quote endpoint used for position marks and alert re-evaluation.
 * Returns the data source on every response so the UI can badge it correctly.
 */
export async function GET(request: Request) {
  return withUser(async () => {
    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get("symbols") ?? "";
    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && getInstrument(s));

    if (!symbols.length) return fail("Provide ?symbols=BTC/USD,ETH/USD", 422, "VALIDATION");

    const provider = getMarketDataProvider();
    const quotes = await provider.getQuotes(symbols);

    return json({
      quotes,
      source: provider.source,
      provider: provider.label,
      status: describeMarketData(),
      timestamp: Date.now(),
    });
  });
}

/** Re-validate a saved setup against current price action. */
export async function POST(request: Request) {
  return withUser(async () => {
    const body = (await request.json()) as { setups?: TradeSetup[] };
    const setups = body.setups ?? [];
    if (!Array.isArray(setups) || !setups.length) return json({ statuses: {} });

    const provider = getMarketDataProvider();
    const symbols = [...new Set(setups.map((s) => s.symbol))].filter((s) => getInstrument(s));
    const quotes = await provider.getQuotes(symbols);
    const priceBySymbol = new Map(quotes.map((q) => [q.symbol, q.price]));

    const statuses: Record<string, string> = {};
    for (const setup of setups) {
      const price = priceBySymbol.get(setup.symbol);
      if (price == null) continue;
      const riskDistance = Math.abs(setup.stop - setup.referencePrice) || setup.referencePrice * 0.01;
      statuses[setup.id] = validateSetup(setup, price, riskDistance * 0.6, Date.now());
    }
    return json({ statuses, prices: Object.fromEntries(priceBySymbol) });
  });
}
