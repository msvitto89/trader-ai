/**
 * Plan entitlements and daily usage metering.
 *
 * Free tier is genuinely useful — it covers the whole core loop — but capped
 * on daily AI volume and depth. Limits are enforced server-side; the UI only
 * mirrors them.
 */

import { execute, queryOne } from "./db";
import type { Plan, UsageLimits } from "./types";

export type MeteredFeature = "analysis" | "scan" | "chat";

export interface Entitlements {
  plan: Plan;
  dailyAnalyses: number | null;
  dailyScans: number | null;
  dailyChats: number | null;
  timeframeDepth: number;
  maxScanResults: number;
  advancedScenarios: boolean;
  journalInsights: boolean;
  portfolioAnalytics: boolean;
  alerts: boolean;
  maxAlerts: number;
  setupExplanations: boolean;
  paperPositions: number | null;
}

export const ENTITLEMENTS: Record<Plan, Entitlements> = {
  free: {
    plan: "free",
    dailyAnalyses: 8,
    dailyScans: 5,
    dailyChats: 25,
    timeframeDepth: 4,
    maxScanResults: 6,
    advancedScenarios: false,
    journalInsights: false,
    portfolioAnalytics: false,
    alerts: true,
    maxAlerts: 3,
    setupExplanations: true,
    paperPositions: 10,
  },
  pro: {
    plan: "pro",
    dailyAnalyses: null,
    dailyScans: null,
    dailyChats: null,
    timeframeDepth: 7,
    maxScanResults: 15,
    advancedScenarios: true,
    journalInsights: true,
    portfolioAnalytics: true,
    alerts: true,
    maxAlerts: 50,
    setupExplanations: true,
    paperPositions: null,
  },
};

export function entitlementsFor(plan: Plan): Entitlements {
  return ENTITLEMENTS[plan] ?? ENTITLEMENTS.free;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getUsage(userId: string, feature: MeteredFeature): number {
  const row = queryOne<{ count: number }>(
    "SELECT count FROM usage_counters WHERE user_id = ? AND feature = ? AND day = ?",
    [userId, feature, today()],
  );
  return row?.count ?? 0;
}

export interface ConsumeResult {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  message?: string;
}

/**
 * Check-and-increment in one call. Increments only when allowed, so a blocked
 * request never burns quota.
 */
export function consume(userId: string, plan: Plan, feature: MeteredFeature, cost = 1): ConsumeResult {
  const ent = entitlementsFor(plan);
  const limit =
    feature === "analysis" ? ent.dailyAnalyses : feature === "scan" ? ent.dailyScans : ent.dailyChats;
  const used = getUsage(userId, feature);

  if (limit !== null && used + cost > limit) {
    const label = feature === "analysis" ? "AI analyses" : feature === "scan" ? "scanner runs" : "copilot messages";
    return {
      allowed: false,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      message: `You've used all ${limit} ${label} on the Free plan today. Limits reset at 00:00 UTC, or upgrade to Pro for unlimited access.`,
    };
  }

  execute(
    `INSERT INTO usage_counters (user_id, feature, day, count) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, feature, day) DO UPDATE SET count = count + ?`,
    [userId, feature, today(), cost, cost],
  );

  return {
    allowed: true,
    used: used + cost,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used - cost),
  };
}

export function usageSummary(userId: string, plan: Plan): UsageLimits {
  const ent = entitlementsFor(plan);
  return {
    plan,
    analysesUsedToday: getUsage(userId, "analysis"),
    analysesLimit: ent.dailyAnalyses,
    scansUsedToday: getUsage(userId, "scan"),
    scansLimit: ent.dailyScans,
    chatsUsedToday: getUsage(userId, "chat"),
    chatsLimit: ent.dailyChats,
  };
}

/** Server-side guard used by every AI route. */
export class PlanLimitError extends Error {
  readonly limit: number | null;
  readonly used: number;
  constructor(message: string, used: number, limit: number | null) {
    super(message);
    this.name = "PlanLimitError";
    this.used = used;
    this.limit = limit;
  }
}
