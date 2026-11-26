import { z } from "zod";
import { createUser, startSession } from "@/lib/auth";
import { audit } from "@/lib/db/repo";
import { fail, json, mapError, rateLimit } from "@/lib/api-helpers";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  name: z.string().min(1, "Enter your name.").max(60),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(200)
    .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Include at least one letter and one number."),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`register:${ip}`, 8, 60_000)) {
      return fail("Too many attempts. Wait a minute and try again.", 429, "RATE_LIMITED");
    }
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check your details.", 422, "VALIDATION");
    }
    const result = createUser(parsed.data.email, parsed.data.name, parsed.data.password);
    if (!result.ok) return fail(result.error, 409, "EMAIL_TAKEN");

    await startSession(result.user.id, request.headers.get("user-agent") ?? undefined);
    audit(result.user.id, "user.register");
    return json({ user: result.user }, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
