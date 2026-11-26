import { getCurrentUser } from "@/lib/auth";
import { usageSummary } from "@/lib/plan";
import { describeMarketData } from "@/lib/market-data";
import { json, mapError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ user: null, usage: null, marketData: describeMarketData() });
    return json({
      user,
      usage: usageSummary(user.id, user.plan),
      marketData: describeMarketData(),
    });
  } catch (err) {
    return mapError(err);
  }
}
