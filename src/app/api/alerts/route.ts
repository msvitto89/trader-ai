import { z } from "zod";
import {
  createAlert,
  createAlertEvent,
  deleteAlert,
  listAlertEvents,
  listAlerts,
  markAlertsRead,
  toggleAlert,
} from "@/lib/db/repo";
import { evaluateAlerts, toAlertEvent } from "@/lib/engines/alerts";
import { entitlementsFor } from "@/lib/plan";
import { getInstrument } from "@/lib/instruments";
import { fail, json, withUser } from "@/lib/api-helpers";
import { cachedAnalyses } from "@/lib/api-helpers";

const createSchema = z.object({
  symbol: z.string().min(1),
  kind: z.enum([
    "price-above",
    "price-below",
    "breakout",
    "trend-change",
    "ai-opportunity",
    "risk",
    "economic-event",
  ]),
  value: z.number().nullable(),
  note: z.string().max(240).optional(),
});

export async function GET() {
  return withUser(async (user) => {
    const rules = listAlerts(user.id);
    const events = listAlertEvents(user.id);
    return json({ rules, events, maxAlerts: entitlementsFor(user.plan).maxAlerts });
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await request.json();

    if (body?.action === "mark-read") {
      markAlertsRead(user.id);
      return json({ events: listAlertEvents(user.id) });
    }

    if (body?.action === "evaluate") {
      const rules = listAlerts(user.id);
      const knownBias = new Map(
        [...cachedAnalyses().values()].map((a) => [a.symbol, a.overallBias] as const),
      );
      const evaluations = await evaluateAlerts(rules, { style: user.preferences.style, knownBias });
      // Only record events we have not already fired for the same rule recently.
      const recent = listAlertEvents(user.id, 60);
      let created = 0;
      for (const ev of evaluations) {
        const duplicate = recent.some(
          (r) => r.ruleId === ev.rule.id && Date.now() - r.createdAt < 30 * 60_000,
        );
        if (duplicate) continue;
        createAlertEvent(user.id, toAlertEvent(user.id, ev));
        created += 1;
      }
      return json({ evaluations, created, events: listAlertEvents(user.id) });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the alert.", 422, "VALIDATION");
    if (!getInstrument(parsed.data.symbol)) return fail("Unknown instrument.", 404, "UNKNOWN_SYMBOL");

    const existing = listAlerts(user.id);
    const max = entitlementsFor(user.plan).maxAlerts;
    if (existing.length >= max) {
      return fail(
        `The ${user.plan === "free" ? "Free" : "Pro"} plan allows up to ${max} alerts. Delete one or upgrade.`,
        402,
        "PLAN_LIMIT",
      );
    }

    const needsValue = ["price-above", "price-below", "risk"].includes(parsed.data.kind);
    if (needsValue && parsed.data.value == null) {
      return fail("This alert type needs a threshold value.", 422, "VALIDATION");
    }

    const rule = createAlert(user.id, {
      symbol: parsed.data.symbol,
      kind: parsed.data.kind,
      value: parsed.data.value,
      note: parsed.data.note ?? "",
    });
    return json({ rule, rules: listAlerts(user.id) }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return withUser(async (user) => {
    const body = await request.json();
    if (!body?.id || typeof body.active !== "boolean") return fail("Invalid alert update.", 422, "VALIDATION");
    toggleAlert(user.id, body.id, body.active);
    return json({ rules: listAlerts(user.id) });
  });
}

export async function DELETE(request: Request) {
  return withUser(async (user) => {
    const body = (await request.json()) as { id?: string };
    if (!body.id) return fail("Provide an alert id.", 422, "VALIDATION");
    deleteAlert(user.id, body.id);
    return json({ rules: listAlerts(user.id) });
  });
}
