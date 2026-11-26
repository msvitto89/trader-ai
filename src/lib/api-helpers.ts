/**
 * Server-side helpers for route handlers: consistent JSON errors, auth
 * guards, and a shared analysis cache so the copilot can reason over the same
 * data the UI last displayed.
 */

import { NextResponse } from "next/server";
import { AuthError, getCurrentUser } from "./auth";
import { MarketDataError } from "./market-data";
import { PlanLimitError } from "./plan";
import type { AIAnalysis, UserProfile } from "./types";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function fail(error: string, status = 400, code?: string, details?: unknown) {
  return NextResponse.json({ error, code, details }, { status, headers: { "Cache-Control": "no-store" } });
}

export interface AuthedUser {
  user: UserProfile;
}

/** Wraps a handler with auth + uniform error mapping. */
export async function withUser(
  handler: (user: UserProfile) => Promise<Response>,
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Sign in to continue.", 401, "UNAUTHENTICATED");
    return await handler(user);
  } catch (err) {
    return mapError(err);
  }
}

export function mapError(err: unknown): Response {
  if (err instanceof AuthError) return fail(err.message, 401, "UNAUTHENTICATED");
  if (err instanceof PlanLimitError) {
    return NextResponse.json(
      { error: err.message, code: "PLAN_LIMIT", details: { used: err.used, limit: err.limit } },
      { status: 402 },
    );
  }
  if (err instanceof MarketDataError) {
    const status = err.code === "NOT_CONFIGURED" ? 503 : 502;
    return fail(
      err.code === "NOT_CONFIGURED"
        ? "Market data is not configured. Set MARKET_DATA_PROVIDER or provide provider credentials."
        : err.message,
      status,
      err.code,
    );
  }
  if (err instanceof Error) {
    const isValidation = /must be|required|invalid|unknown/i.test(err.message);
    return fail(isValidation ? err.message : "Something went wrong on our side. Please try again.", isValidation ? 422 : 500);
  }
  return fail("Unexpected error", 500);
}

/* ─────────────────────────────────────────────────────────────
   Shared in-process analysis cache.
   The copilot, scanner and briefing run in the same Node process, so a small
   LRU lets them reuse recent engine output instead of recomputing. Keyed by
   symbol only — never by user — because the underlying market analysis is
   identical for everyone (personalisation happens in ranking, not pricing).
   ───────────────────────────────────────────────────────────── */

const ANALYSIS_TTL = 120_000;
const MAX_ENTRIES = 60;

interface CacheEntry {
  at: number;
  analysis: AIAnalysis;
}

const globalForCache = globalThis as unknown as { __tradiaAnalysisCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> =
  globalForCache.__tradiaAnalysisCache ?? (globalForCache.__tradiaAnalysisCache = new Map());

export function cacheAnalysis(key: string, analysis: AIAnalysis): void {
  cache.set(key, { at: Date.now(), analysis });
  if (cache.size > MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - MAX_ENTRIES);
    for (const [k] of oldest) cache.delete(k);
  }
}

export function getCachedAnalysis(symbol: string): AIAnalysis | null {
  const entry = cache.get(`${symbol}`);
  if (!entry) return null;
  if (Date.now() - entry.at > ANALYSIS_TTL) {
    cache.delete(symbol);
    return null;
  }
  return entry.analysis;
}

export function cachedAnalyses(symbols?: string[]): Map<string, AIAnalysis> {
  const out = new Map<string, AIAnalysis>();
  for (const [key, entry] of cache) {
    if (Date.now() - entry.at > ANALYSIS_TTL) continue;
    if (symbols && !symbols.includes(entry.analysis.symbol)) continue;
    if (key.includes(":")) continue; // per-timeframe variants
    out.set(entry.analysis.symbol, entry.analysis);
  }
  return out;
}

/** Lightweight rate limiting for unauthenticated endpoints (login/register). */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= limit) return false;
  record.count += 1;
  return true;
}
