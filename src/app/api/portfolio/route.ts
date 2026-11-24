import { buildPortfolio, positionMetrics } from "@/lib/engines/portfolio";
import { analyzeJournal } from "@/lib/engines/journal";
import { listJournal, listPositions } from "@/lib/db/repo";
import { getMarketDataProvider } from "@/lib/market-data";
import { entitlementsFor } from "@/lib/plan";
import { json, withUser } from "@/lib/api-helpers";

export async function GET() {
  return withUser(async (user) => {
    const positions = listPositions(user.id);
    const journal = listJournal(user.id);
    const provider = getMarketDataProvider();

    const open = positions.filter((p) => p.closedAt == null);
    const symbols = [...new Set(open.map((p) => p.symbol))];
    const quotes = symbols.length ? await provider.getQuotes(symbols) : [];
    const priceBySymbol = new Map(quotes.map((q) => [q.symbol, q.price]));

    const marks = open.map((p) => {
      const price = priceBySymbol.get(p.symbol) ?? p.entry;
      const m = positionMetrics(p, price);
      return { position: p, mark: price, ...m };
    });

    const summary = buildPortfolio({
      startingEquity: user.preferences.defaultBalance,
      currency: user.preferences.currency,
      positions,
      journal,
      openPositions: marks.map((m) => ({ unrealizedPnl: m.unrealizedPnl, riskAmount: m.riskAmount })),
      priceOf: (s) => priceBySymbol.get(s) ?? 0,
    });

    const ent = entitlementsFor(user.plan);

    return json({
      summary,
      marks,
      source: provider.source,
      journalInsights: ent.journalInsights ? analyzeJournal(journal).slice(0, 3) : [],
      analyticsLocked: !ent.portfolioAnalytics,
    });
  });
}
