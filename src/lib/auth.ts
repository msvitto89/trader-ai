/**
 * Authentication.
 *
 * - Passwords: scrypt with a per-user random salt, stored as
 *   `scrypt$N$r$p$salt$hash`. Verification is constant-time.
 * - Sessions: opaque 256-bit random tokens in an httpOnly, SameSite=Lax
 *   cookie. Only a SHA-256 hash of the token is stored server-side, so a
 *   database leak does not hand over live sessions.
 * - No tokens or hashes ever reach client components.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { execute, newId, queryOne } from "./db";
import type { Plan, UserPreferences, UserProfile } from "./types";

export const SESSION_COOKIE = "tradia_session";
const SESSION_TTL_MS = 30 * 24 * 3_600_000;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const derived = scryptSync(password, salt, KEYLEN, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(hash, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  plan: string;
  created_at: number;
  onboarded_at: number | null;
  preferences: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  markets: ["crypto", "forex"],
  style: "day",
  experience: "intermediate",
  riskPreference: "moderate",
  defaultRiskPct: 1,
  defaultBalance: 10000,
  currency: "USD",
  briefingTime: "07:30",
  alertsEnabled: true,
  compactMode: false,
};

export function rowToProfile(row: UserRow, watchlist: string[] = []): UserProfile {
  let prefs: UserPreferences = { ...DEFAULT_PREFERENCES };
  try {
    prefs = { ...prefs, ...(JSON.parse(row.preferences) as Partial<UserPreferences>) };
  } catch {
    /* fall back to defaults */
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    plan: (row.plan === "pro" ? "pro" : "free") as Plan,
    createdAt: row.created_at,
    onboardedAt: row.onboarded_at,
    preferences: prefs,
    watchlist,
  };
}

export function createUser(email: string, name: string, password: string): { ok: true; user: UserProfile } | { ok: false; error: string } {
  const normalised = email.trim().toLowerCase();
  const existing = queryOne<UserRow>("SELECT * FROM users WHERE email = ?", [normalised]);
  if (existing) return { ok: false, error: "An account with this email already exists." };

  const id = newId("usr");
  const now = Date.now();
  execute(
    "INSERT INTO users (id, email, name, password_hash, plan, created_at, preferences) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, normalised, name.trim() || "Trader", hashPassword(password), "free", now, JSON.stringify(DEFAULT_PREFERENCES)],
  );
  const row = queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  if (!row) return { ok: false, error: "Could not create the account." };
  return { ok: true, user: rowToProfile(row) };
}

export function authenticate(email: string, password: string): UserProfile | null {
  const row = queryOne<UserRow>("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return rowToProfile(row);
}

export async function startSession(userId: string, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  execute(
    "INSERT INTO sessions (token, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
    [tokenHash(token), userId, now, now + SESSION_TTL_MS, userAgent ?? null],
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return token;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    execute("DELETE FROM sessions WHERE token = ?", [tokenHash(token)]);
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = queryOne<{ user_id: string; expires_at: number }>(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?",
    [tokenHash(token)],
  );
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    execute("DELETE FROM sessions WHERE token = ?", [tokenHash(token)]);
    return null;
  }
  const row = queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [session.user_id]);
  if (!row) return null;
  const watchlist = (
    queryOne<{ symbols: string | null }>(
      "SELECT GROUP_CONCAT(symbol) AS symbols FROM (SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY added_at)",
      [row.id],
    )?.symbols ?? ""
  )
    .split(",")
    .filter(Boolean);
  return rowToProfile(row, watchlist);
}

export async function requireUser(): Promise<UserProfile> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated");
  return user;
}

export class AuthError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

export function updatePreferences(userId: string, patch: Partial<UserPreferences>): UserPreferences {
  const row = queryOne<UserRow>("SELECT preferences FROM users WHERE id = ?", [userId]);
  let current: UserPreferences = { ...DEFAULT_PREFERENCES };
  try {
    current = { ...current, ...(row ? (JSON.parse(row.preferences) as Partial<UserPreferences>) : {}) };
  } catch {
    /* defaults */
  }
  const next = { ...current, ...patch };
  execute("UPDATE users SET preferences = ? WHERE id = ?", [JSON.stringify(next), userId]);
  return next;
}

export function markOnboarded(userId: string): void {
  execute("UPDATE users SET onboarded_at = ? WHERE id = ?", [Date.now(), userId]);
}

export function setPlan(userId: string, plan: Plan): void {
  execute("UPDATE users SET plan = ? WHERE id = ?", [plan, userId]);
}

export function changePassword(userId: string, currentPassword: string, newPassword: string): boolean {
  const row = queryOne<UserRow>("SELECT password_hash FROM users WHERE id = ?", [userId]);
  if (!row) return false;
  if (!verifyPassword(currentPassword, row.password_hash)) return false;
  execute("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(newPassword), userId]);
  execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
  return true;
}

export function purgeExpiredSessions(): void {
  execute("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
}
