import { execute, getDb, newId, queryOne } from "@/lib/db";

/**
 * Deployment self-check. Open /api/health in the browser after a deploy.
 *
 * Reports what the running process actually sees: whether the database is
 * reachable, whether the provisioned account exists, and its plan. It answers
 * the one question that matters when a login fails on a fresh host — "was the
 * account created in *this* instance?" — without needing the platform logs.
 *
 * Exposes no hashes, tokens or passwords, only whether a credential is valid.
 */

export const dynamic = "force-dynamic";

const DEFAULT_EMAIL = (
  process.env.PROVISION_EMAIL ??
  process.env.SEED_EMAIL ??
  "trader@tradia.ai"
)
  .trim()
  .toLowerCase();

export async function GET() {
  const report: Record<string, unknown> = {
    app: "TRADIA AI",
    node: process.version,
    dataSource: process.env.MARKET_DATA_PROVIDER ?? "demo",
    databasePath: process.env.TRADIA_DB_PATH ?? "./data/tradia.db",
    provisionEmailConfigured: DEFAULT_EMAIL,
    bootstrapEnabled: process.env.BOOTSTRAP !== "0",
  };

  try {
    getDb();
    report.database = "reachable";

    const row = queryOne<{
      id: string;
      email: string;
      plan: string;
      onboarded_at: number | null;
    }>("SELECT id, email, plan, onboarded_at FROM users WHERE email = ?", [
      DEFAULT_EMAIL,
    ]);

    report.account = row
      ? {
          exists: true,
          email: row.email,
          plan: row.plan,
          onboarded: row.onboarded_at !== null,
        }
      : { exists: false, hint: "Provisioning did not run in this instance. Redeploy or check the build logs for [bootstrap]." };

    const counts = queryOne<{ users: number }>("SELECT COUNT(*) AS users FROM users");
    report.userCount = counts?.users ?? 0;

    // Touch the write path: a read-only filesystem fails only on write.
    execute("CREATE TABLE IF NOT EXISTS _health_probe (id TEXT PRIMARY KEY)");
    execute("INSERT OR REPLACE INTO _health_probe (id) VALUES (?)", [newId("hp")]);
    report.writable = true;
  } catch (err) {
    report.database = "error";
    report.error = err instanceof Error ? err.message : String(err);
    report.writable = false;
  }

  return Response.json(report, {
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Create the provisioned account in the running instance.
 *
 * POST /api/health  → provisions if missing, repairs plan/onboarding if present.
 *
 * Deliberately idempotent and non-destructive: it never overwrites the password
 * of an account that already exists, so it cannot be used to take over a login.
 * Safe to call from the browser after a deploy whose bootstrap step did not run.
 */
export async function POST() {
  try {
    getDb();
    const password = process.env.PROVISION_PASSWORD ?? process.env.SEED_PASSWORD;
    const inserted = queryOne<{ id: string }>(
      "SELECT id FROM users WHERE email = ?",
      [DEFAULT_EMAIL],
    );

    if (inserted) {
      execute(
        "UPDATE users SET plan = 'pro', onboarded_at = COALESCE(onboarded_at, ?) WHERE id = ?",
        [Date.now(), inserted.id],
      );
      return Response.json({
        status: "already-exists",
        email: DEFAULT_EMAIL,
        message:
          "The account already exists. Its password was left untouched — use the password it was created with.",
      });
    }

    // Reuse the seeding path so preferences, watchlist and sample data match a
    // normal provisioning run.
    const { hashPassword, updatePreferences } = await import("@/lib/auth");
    const userId = newId("usr");
    if (!password) {
      return Response.json(
        {
          status: "missing-password",
          message:
            "No PROVISION_PASSWORD configured, so an account cannot be created here. Use /register instead.",
        },
        { status: 400 },
      );
    }

    execute(
      "INSERT INTO users (id, email, name, password_hash, plan, created_at, onboarded_at, preferences) VALUES (?, ?, ?, ?, 'pro', ?, ?, ?)",
      [
        userId,
        DEFAULT_EMAIL,
        "Trader",
        hashPassword(password),
        Date.now(),
        Date.now(),
        JSON.stringify({}),
      ],
    );
    updatePreferences(userId, {
      markets: ["crypto", "forex", "commodities"],
      style: "swing",
      experience: "intermediate",
      riskPreference: "moderate",
      defaultRiskPct: 1,
      defaultBalance: 25_000,
      currency: "USD",
    });

    return Response.json({
      status: "created",
      email: DEFAULT_EMAIL,
      plan: "pro",
      message: "Account created. Sign in with the configured password.",
    });
  } catch (err) {
    return Response.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
