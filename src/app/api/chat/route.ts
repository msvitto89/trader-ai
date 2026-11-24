import { z } from "zod";
import { buildReply, type ChatContext } from "@/lib/ai/chat";
import { analyzeJournal } from "@/lib/engines/journal";
import { buildPortfolio, positionMetrics } from "@/lib/engines/portfolio";
import { clearChat, listChat, listJournal, listPositions, saveChatMessage } from "@/lib/db/repo";
import { getMarketDataProvider } from "@/lib/market-data";
import { PlanLimitError, consume, entitlementsFor } from "@/lib/plan";
import { cachedAnalyses, fail, json, withUser } from "@/lib/api-helpers";
import type { ChatMessage } from "@/lib/types";

const schema = z.object({ message: z.string().min(1, "Type a question.").max(600) });

export async function GET() {
  return withUser(async (user) => {
    return json({ messages: listChat(user.id) });
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Type a question.", 422, "VALIDATION");

    const ent = entitlementsFor(user.plan);
    const quota = consume(user.id, user.plan, "chat");
    if (!quota.allowed) throw new PlanLimitError(quota.message ?? "Daily limit reached", quota.used, quota.limit);

    const history = listChat(user.id, 20);
    const userMessage = saveChatMessage(user.id, { role: "user", content: parsed.data.message });

    // Assemble grounded context from this user's own product state.
    const positions = listPositions(user.id);
    const journal = listJournal(user.id);
    const open = positions.filter((p) => p.closedAt == null);
    const provider = getMarketDataProvider();
    const quotes = open.length ? await provider.getQuotes([...new Set(open.map((p) => p.symbol))]) : [];
    const priceBySymbol = new Map(quotes.map((q) => [q.symbol, q.price]));
    const marks = open.map((p) => positionMetrics(p, priceBySymbol.get(p.symbol) ?? p.entry));

    const ctx: ChatContext = {
      analyses: cachedAnalyses(),
      portfolio: buildPortfolio({
        startingEquity: user.preferences.defaultBalance,
        currency: user.preferences.currency,
        positions,
        journal,
        openPositions: marks.map((m) => ({ unrealizedPnl: m.unrealizedPnl, riskAmount: m.riskAmount })),
        priceOf: (s) => priceBySymbol.get(s) ?? 0,
      }),
      journal,
      journalInsights: analyzeJournal(journal),
      riskDefaults: { balance: user.preferences.defaultBalance, riskPct: user.preferences.defaultRiskPct },
      watchlist: user.watchlist,
      plan: user.plan,
    };

    const reply = buildReply(parsed.data.message, ctx, history);

    const assistantMessage: ChatMessage = saveChatMessage(user.id, {
      role: "assistant",
      content: reply.content,
      blocks: reply.blocks,
      sources: reply.sources,
    });

    return json({
      userMessage,
      assistantMessage,
      symbols: reply.symbols,
      usage: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
      entitlements: ent,
    });
  });
}

export async function DELETE() {
  return withUser(async (user) => {
    clearChat(user.id);
    return json({ ok: true });
  });
}
