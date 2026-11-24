import { z } from "zod";
import { getCurrentUser, setPlan } from "@/lib/auth";
import { audit } from "@/lib/db/repo";
import { entitlementsFor, usageSummary } from "@/lib/plan";
import { fail, json, withUser } from "@/lib/api-helpers";

const schema = z.object({ plan: z.enum(["free", "pro"]) });

/**
 * Plan changes.
 *
 * This build flips entitlements locally so the Pro experience can be evaluated
 * end-to-end. A production deployment replaces the body of this handler with a
 * billing-provider webhook that verifies payment before `setPlan` is called —
 * the entitlement layer itself does not change.
 */
export async function POST(request: Request) {
  return withUser(async (user) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail("Choose a valid plan.", 422, "VALIDATION");

    setPlan(user.id, parsed.data.plan);
    audit(user.id, "plan.change", parsed.data.plan);
    const updated = await getCurrentUser();

    return json({
      user: updated,
      entitlements: entitlementsFor(parsed.data.plan),
      usage: updated ? usageSummary(updated.id, updated.plan) : null,
      note:
        parsed.data.plan === "pro"
          ? "Pro entitlements enabled for this workspace (demo billing — no payment taken)."
          : "Switched to the Free plan.",
    });
  });
}
