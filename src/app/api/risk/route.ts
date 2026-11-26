import { z } from "zod";
import { calculateRisk } from "@/lib/engines/risk";
import { fail, json, withUser } from "@/lib/api-helpers";
import { getInstrument } from "@/lib/instruments";

const schema = z.object({
  symbol: z.string().min(1),
  balance: z.number().positive(),
  riskPct: z.number().positive(),
  entry: z.number().positive(),
  stop: z.number().positive(),
  takeProfit: z.number().positive(),
  direction: z.enum(["long", "short"]),
  leverage: z.number().positive().optional(),
  openExposure: z.number().nonnegative().optional(),
});

export async function POST(request: Request) {
  return withUser(async (user) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the risk inputs.", 422, "VALIDATION");
    }
    if (!getInstrument(parsed.data.symbol)) return fail("Unknown instrument.", 404, "UNKNOWN_SYMBOL");

    // The risk engine is pure and user-agnostic; defaults come from prefs when
    // the client omits exposure context.
    const result = calculateRisk(parsed.data);
    return json({
      result,
      defaults: {
        balance: user.preferences.defaultBalance,
        riskPct: user.preferences.defaultRiskPct,
        currency: user.preferences.currency,
      },
    });
  });
}
