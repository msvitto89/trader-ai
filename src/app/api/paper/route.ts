import { z } from "zod";
import { entitlementsFor } from "@/lib/plan";
import { closePosition } from "@/lib/engines/portfolio";
import { calculateRisk } from "@/lib/engines/risk";
import {
  closePositionRecord,
  countOpenPositions,
  createPosition,
  deletePosition,
  listPositions,
  updatePositionLevels,
} from "@/lib/db/repo";
import { getMarketDataProvider } from "@/lib/market-data";
import { getInstrument } from "@/lib/instruments";
import { fail, json, withUser } from "@/lib/api-helpers";

const openSchema = z.object({
  symbol: z.string().min(1),
  direction: z.enum(["long", "short"]),
  size: z.number().positive(),
  entry: z.number().positive().optional(),
  stop: z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
  setupId: z.string().nullable().optional(),
  notes: z.string().max(500).optional(),
});

const closeSchema = z.object({
  id: z.string().min(1),
  exitPrice: z.number().positive().optional(),
});

const modifySchema = z.object({
  id: z.string().min(1),
  stop: z.number().positive().nullable(),
  takeProfit: z.number().positive().nullable(),
});

export async function GET() {
  return withUser(async (user) => {
    const positions = listPositions(user.id);
    const open = positions.filter((p) => p.closedAt == null);
    const provider = getMarketDataProvider();
    const symbols = [...new Set(open.map((p) => p.symbol))];
    const quotes = symbols.length ? await provider.getQuotes(symbols) : [];

    return json({
      positions,
      quotes,
      source: provider.source,
      entitlement: entitlementsFor(user.plan).paperPositions,
    });
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await request.json();
    const action = body?.action as string | undefined;

    /* ── Modify SL/TP ─────────────────────────────────────────── */
    if (action === "modify") {
      const parsed = modifySchema.safeParse(body);
      if (!parsed.success) return fail("Provide stop and take profit levels.", 422, "VALIDATION");
      updatePositionLevels(user.id, parsed.data.id, parsed.data.stop, parsed.data.takeProfit);
      return json({ positions: listPositions(user.id) });
    }

    /* ── Close ────────────────────────────────────────────────── */
    if (action === "close") {
      const parsed = closeSchema.safeParse(body);
      if (!parsed.success) return fail("Invalid close request.", 422, "VALIDATION");
      const position = listPositions(user.id, { limit: 500 }).find((p) => p.id === parsed.data.id && p.closedAt == null);
      if (!position) return fail("Open position not found.", 404, "NOT_FOUND");

      let exit = parsed.data.exitPrice;
      if (!exit) {
        const provider = getMarketDataProvider();
        const quote = await provider.getQuote(position.symbol);
        exit = quote.price;
      }
      const closed = closePosition(position, exit);
      const saved = closePositionRecord(user.id, position.id, exit, closed.pnl ?? 0, closed.pnlPct ?? 0);
      return json({ position: saved, positions: listPositions(user.id) });
    }

    /* ── Open ─────────────────────────────────────────────────── */
    const parsed = openSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the trade details.", 422, "VALIDATION");
    if (!getInstrument(parsed.data.symbol)) return fail("Unknown instrument.", 404, "UNKNOWN_SYMBOL");

    const ent = entitlementsFor(user.plan);
    const openCount = countOpenPositions(user.id);
    if (ent.paperPositions !== null && openCount >= ent.paperPositions) {
      return fail(
        `The Free plan allows ${ent.paperPositions} open paper positions at once. Close one or upgrade to Pro for unlimited.`,
        402,
        "PLAN_LIMIT",
      );
    }

    // Entry price defaults to the live mark; explicit entries are validated
    // against the stop so an unusable trade cannot be recorded.
    const provider = getMarketDataProvider();
    const quote = await provider.getQuote(parsed.data.symbol);
    const entry = parsed.data.entry ?? quote.price;

    if (parsed.data.stop != null) {
      const check = calculateRisk({
        symbol: parsed.data.symbol,
        balance: 100000,
        riskPct: 1,
        entry,
        stop: parsed.data.stop,
        takeProfit:
          parsed.data.takeProfit ??
          (parsed.data.direction === "long" ? entry * 1.02 : entry * 0.98),
        direction: parsed.data.direction,
      });
      const stopIsValid =
        parsed.data.direction === "long" ? parsed.data.stop < entry : parsed.data.stop > entry;
      if (!stopIsValid) {
        return fail(
          `For a ${parsed.data.direction}, the stop must be ${parsed.data.direction === "long" ? "below" : "above"} the entry.`,
          422,
          "INVALID_STOP",
        );
      }
      if (check.stopDistancePct < 0.02) {
        return fail("That stop is inside normal spread and noise for this instrument.", 422, "STOP_TOO_TIGHT");
      }
    }

    const position = createPosition(user.id, {
      symbol: parsed.data.symbol,
      direction: parsed.data.direction,
      entry,
      size: parsed.data.size,
      stop: parsed.data.stop ?? null,
      takeProfit: parsed.data.takeProfit ?? null,
      setupId: parsed.data.setupId ?? null,
      notes: parsed.data.notes ?? "",
      source: parsed.data.setupId ? "ai-setup" : "manual",
    });

    return json({ position, positions: listPositions(user.id) }, { status: 201 });
  });
}

export async function DELETE(request: Request) {
  return withUser(async (user) => {
    const body = (await request.json()) as { id?: string };
    if (!body.id) return fail("Provide a position id.", 422, "VALIDATION");
    deletePosition(user.id, body.id);
    return json({ positions: listPositions(user.id) });
  });
}
