import { z } from "zod";
import { markOnboarded, requireUser, updatePreferences } from "@/lib/auth";
import { fail, json, withUser } from "@/lib/api-helpers";
import type { UserPreferences } from "@/lib/types";

const schema = z.object({
  markets: z.array(z.enum(["crypto", "forex", "stocks", "indices", "commodities"])).min(1).optional(),
  style: z.enum(["scalping", "day", "swing", "longterm"]).optional(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  riskPreference: z.enum(["conservative", "moderate", "aggressive"]).optional(),
  defaultRiskPct: z.number().min(0.05).max(10).optional(),
  defaultBalance: z.number().min(100).max(100_000_000).optional(),
  currency: z.string().min(3).max(3).optional(),
  briefingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  alertsEnabled: z.boolean().optional(),
  compactMode: z.boolean().optional(),
  completeOnboarding: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  return withUser(async (user) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid preferences.", 422, "VALIDATION");

    const { completeOnboarding, ...patch } = parsed.data;
    const preferences = updatePreferences(user.id, patch as Partial<UserPreferences>);
    if (completeOnboarding) markOnboarded(user.id);

    return json({ preferences, onboardedAt: completeOnboarding ? Date.now() : user.onboardedAt });
  });
}

export async function GET() {
  return withUser(async () => {
    const user = await requireUser();
    return json({ preferences: user.preferences });
  });
}
