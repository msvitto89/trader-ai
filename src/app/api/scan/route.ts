import { z } from "zod";
import { runScan } from "@/lib/engines/scanner";
import { entitlementsFor, PlanLimitError, consume } from "@/lib/plan";
import { cacheAnalysis, fail, json, withUser } from "@/lib/api-helpers";
import type { AssetClass } from "@/lib/types";

const schema = z.object({
  assetClasses: z.array(z.enum(["crypto", "forex", "stocks", "indices", "commodities"])).optional(),
  style: z.enum(["scalping", "day", "swing", "longterm"]).optional(),
  risk: z.enum(["conservative", "moderate", "aggressive"]).optional(),
});

export async function POST(request: Request) {
  return withUser(async (user) => {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("Check the scanner filters.", 422, "VALIDATION");

    const ent = entitlementsFor(user.plan);
    const quota = consume(user.id, user.plan, "scan");
    if (!quota.allowed) throw new PlanLimitError(quota.message ?? "Daily limit reached", quota.used, quota.limit);

    const filters = {
      assetClasses: (parsed.data.assetClasses?.length
        ? parsed.data.assetClasses
        : user.preferences.markets) as AssetClass[],
      style: parsed.data.style ?? user.preferences.style,
      risk: parsed.data.risk ?? user.preferences.riskPreference,
      limit: ent.maxScanResults,
    };

    const result = await runScan(filters);
    for (const analysis of result.analyses) cacheAnalysis(analysis.symbol, analysis);

    return json({
      rows: result.rows,
      scanned: result.scanned,
      source: result.source,
      provider: result.provider,
      asOf: result.asOf,
      filters: result.filters,
      usedToday: quota.used,
      limitToday: quota.limit,
    });
  });
}
