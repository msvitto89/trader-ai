import { buildBriefing } from "@/lib/engines/briefing";
import { json, withUser } from "@/lib/api-helpers";

export async function GET() {
  return withUser(async (user) => {
    const briefing = await buildBriefing(user.preferences.style);
    return json({ briefing });
  });
}

export async function POST() {
  return withUser(async (user) => {
    const briefing = await buildBriefing(user.preferences.style);
    return json({ briefing });
  });
}
