import { endSession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/db/repo";
import { json, mapError } from "@/lib/api-helpers";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (user) audit(user.id, "user.logout");
    await endSession();
    return json({ ok: true });
  } catch (err) {
    return mapError(err);
  }
}
