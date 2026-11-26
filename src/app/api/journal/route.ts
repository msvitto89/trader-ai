import { z } from "zod";
import { analyzeJournal, journalScorecard } from "@/lib/engines/journal";
import { createJournalEntry, deleteJournalEntry, listJournal, updateJournalEntry } from "@/lib/db/repo";
import { entitlementsFor } from "@/lib/plan";
import { getInstrument } from "@/lib/instruments";
import { fail, json, withUser } from "@/lib/api-helpers";

const createSchema = z.object({
  symbol: z.string().min(1),
  direction: z.enum(["long", "short"]),
  entry: z.number().positive(),
  exit: z.number().positive(),
  stop: z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
  size: z.number().positive(),
  strategy: z.enum(["scalping", "day", "swing", "longterm", "other"]),
  result: z.enum(["win", "loss", "breakeven"]).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().max(24)).max(8).optional(),
  openedAt: z.number().optional(),
  closedAt: z.number().optional(),
});

export async function GET() {
  return withUser(async (user) => {
    const entries = listJournal(user.id);
    const ent = entitlementsFor(user.plan);
    return json({
      entries,
      insights: ent.journalInsights ? analyzeJournal(entries) : [],
      scorecard: journalScorecard(entries),
      insightsLocked: !ent.journalInsights,
    });
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await request.json();

    // Bulk import from a closed paper position.
    if (body?.fromPaperPosition) {
      const entry = createJournalEntry(user.id, {
        symbol: body.fromPaperPosition.symbol,
        direction: body.fromPaperPosition.direction,
        entry: body.fromPaperPosition.entry,
        exit: body.fromPaperPosition.exitPrice,
        stop: body.fromPaperPosition.stop,
        takeProfit: body.fromPaperPosition.takeProfit,
        size: body.fromPaperPosition.size,
        strategy: user.preferences.style,
        result: (body.fromPaperPosition.pnl ?? 0) > 0 ? "win" : (body.fromPaperPosition.pnl ?? 0) < 0 ? "loss" : "breakeven",
        pnl: body.fromPaperPosition.pnl ?? 0,
        notes: body.fromPaperPosition.notes ?? "Imported from paper trading.",
        tags: ["paper"],
        openedAt: body.fromPaperPosition.openedAt,
        closedAt: body.fromPaperPosition.closedAt ?? Date.now(),
        rMultiple: null,
      });
      return json({ entry }, { status: 201 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the trade details.", 422, "VALIDATION");
    if (!getInstrument(parsed.data.symbol)) return fail("Unknown instrument.", 404, "UNKNOWN_SYMBOL");

    const d = parsed.data;
    const dir = d.direction === "long" ? 1 : -1;
    const pnl = (d.exit - d.entry) * d.size * dir;
    const result: "win" | "loss" | "breakeven" = pnl > 0.005 ? "win" : pnl < -0.005 ? "loss" : "breakeven";
    const riskPerUnit = d.stop != null ? Math.abs(d.entry - d.stop) : null;
    const rMultiple = riskPerUnit && riskPerUnit > 0 ? ((d.exit - d.entry) * dir) / riskPerUnit : null;

    const closedAt = d.closedAt ?? Date.now();
    const openedAt = d.openedAt ?? closedAt - 3_600_000;
    if (closedAt <= openedAt) return fail("The close time must be after the open time.", 422, "VALIDATION");

    const entry = createJournalEntry(user.id, {
      symbol: d.symbol,
      direction: d.direction,
      entry: d.entry,
      exit: d.exit,
      stop: d.stop ?? null,
      takeProfit: d.takeProfit ?? null,
      size: d.size,
      strategy: d.strategy,
      result,
      pnl: Number(pnl.toFixed(2)),
      notes: d.notes ?? "",
      tags: d.tags ?? [],
      openedAt,
      closedAt,
      rMultiple: rMultiple != null ? Number(rMultiple.toFixed(2)) : null,
    });

    return json({ entry }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return withUser(async (user) => {
    const body = await request.json();
    if (!body?.id) return fail("Provide an entry id.", 422, "VALIDATION");
    updateJournalEntry(user.id, body.id, {
      notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 8) : undefined,
      strategy: body.strategy,
    });
    return json({ entries: listJournal(user.id) });
  });
}

export async function DELETE(request: Request) {
  return withUser(async (user) => {
    const body = (await request.json()) as { id?: string };
    if (!body.id) return fail("Provide an entry id.", 422, "VALIDATION");
    deleteJournalEntry(user.id, body.id);
    return json({ entries: listJournal(user.id) });
  });
}
