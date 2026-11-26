import { z } from "zod";
import { authenticate, startSession } from "@/lib/auth";
import { audit } from "@/lib/db/repo";
import { fail, json, mapError, rateLimit } from "@/lib/api-helpers";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`login:${ip}`, 10, 60_000)) {
      return fail("Too many sign-in attempts. Wait a minute and try again.", 429, "RATE_LIMITED");
    }
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail("Enter your email and password.", 422, "VALIDATION");

    const user = authenticate(parsed.data.email, parsed.data.password);
    if (!user) return fail("Email or password is incorrect.", 401, "BAD_CREDENTIALS");

    await startSession(user.id, request.headers.get("user-agent") ?? undefined);
    audit(user.id, "user.login");
    return json({ user });
  } catch (err) {
    return mapError(err);
  }
}
