/**
 * Seed a fully populated demo workspace.
 *
 *   npm run db:seed
 *
 * Creates (or reuses) a demo account with:
 *   - onboarding complete, Pro entitlements
 *   - a populated watchlist
 *   - a realistic history of paper positions (open + closed)
 *   - a 30-trade journal with genuine behavioural patterns, so the journal
 *     analyzer has something real to find instead of noise
 *
 * Credentials: demo@tradia.ai / tradia1234
 */

import { hashPassword, updatePreferences } from "../src/lib/auth";
import { execute, getDb, newId, queryOne } from "../src/lib/db";
import { createJournalEntry, createPosition, addWatchlist } from "../src/lib/db/repo";
import { DemoMarketDataProvider } from "../src/lib/market-data/demo";
import type { JournalEntry, TradingStyle } from "../src/lib/types";

/**
 * The account this script creates. On a hosted deploy (Render/Railway) the
 * database lives on an ephemeral disk, so the account is re-created on every
 * boot. The defaults below exist so a fresh deploy is usable with no extra
 * configuration; PROVISION_EMAIL / PROVISION_PASSWORD override them.
 */
const EMAIL = process.env.PROVISION_EMAIL ?? process.env.SEED_EMAIL ?? "trader@tradia.ai";
const PASSWORD = process.env.PROVISION_PASSWORD ?? process.env.SEED_PASSWORD ?? "TradiaPro2026!";
const NAME = process.env.SEED_NAME ?? "Trader";
/** Populate the sample journal / positions / alerts. Set to "0" for a clean workspace. */
const WITH_SAMPLE_DATA = process.env.SEED_SAMPLE_DATA !== "0";
const PLAN = (process.env.SEED_PLAN === "free" ? "free" : "pro") as "free" | "pro";
const DAY = 86_400_000;

interface SeedTrade {
  symbol: string;
  direction: "long" | "short";
  strategy: TradingStyle;
  /** Result in R multiples. Positive = win. */
  r: number;
  /** Days ago the trade closed. */
  daysAgo: number;
  note: string;
}

/**
 * A deliberately imperfect trader: strong in swing, weak in scalping, lets
 * losers run slightly, chases occasionally. This is what the journal analyzer
 * is designed to surface.
 */
const HISTORY: SeedTrade[] = [
  { symbol: "BTC/USD", direction: "long", strategy: "swing", r: 2.4, daysAgo: 29, note: "Breakout retest held. Added on the second higher low." },
  { symbol: "ETH/USD", direction: "long", strategy: "swing", r: -1, daysAgo: 28, note: "Stopped out cleanly. Structure never confirmed." },
  { symbol: "XAU/USD", direction: "short", strategy: "day", r: 1.6, daysAgo: 27, note: "Sold the failed breakout above resistance." },
  { symbol: "EUR/USD", direction: "long", strategy: "scalping", r: -1.2, daysAgo: 26, note: "Entered late, chased the spike." },
  { symbol: "BTC/USD", direction: "long", strategy: "swing", r: 3.1, daysAgo: 25, note: "Held through the pullback. Patience paid." },
  { symbol: "NASDAQ", direction: "long", strategy: "day", r: 1.1, daysAgo: 24, note: "Clean morning continuation." },
  { symbol: "GBP/USD", direction: "short", strategy: "scalping", r: -1, daysAgo: 23, note: "Stopped immediately. Bad entry." },
  { symbol: "ETH/USD", direction: "short", strategy: "day", r: -2.1, daysAgo: 22, note: "Moved my stop twice. Classic mistake." },
  { symbol: "XAU/USD", direction: "long", strategy: "swing", r: 2.2, daysAgo: 21, note: "Bought the higher low after CPI." },
  { symbol: "AAPL", direction: "long", strategy: "swing", r: 1.4, daysAgo: 20, note: "Trend continuation, took partials at 1R." },
  { symbol: "BTC/USD", direction: "short", strategy: "scalping", r: -1.3, daysAgo: 19, note: "Faded strength without confirmation." },
  { symbol: "USD/JPY", direction: "long", strategy: "day", r: 1.8, daysAgo: 18, note: "Range break with volume." },
  { symbol: "ETH/USD", direction: "long", strategy: "swing", r: 2.9, daysAgo: 17, note: "Textbook continuation. No interference." },
  { symbol: "S&P 500", direction: "long", strategy: "swing", r: 1.2, daysAgo: 16, note: "Sized small, slept well." },
  { symbol: "BTC/USD", direction: "long", strategy: "scalping", r: -1.5, daysAgo: 15, note: "Too many trades that day. Tired." },
  { symbol: "DAX", direction: "long", strategy: "day", r: 2, daysAgo: 14, note: "Opening range breakout held all session." },
  { symbol: "XAU/USD", direction: "short", strategy: "swing", r: 1.7, daysAgo: 13, note: "Lower highs on the 4H. Simple." },
  { symbol: "EUR/USD", direction: "short", strategy: "day", r: -1, daysAgo: 12, note: "Range edge fade, no follow-through." },
  { symbol: "BTC/USD", direction: "long", strategy: "swing", r: 3.4, daysAgo: 11, note: "Best trade of the month. Let it run." },
  { symbol: "TSLA", direction: "short", strategy: "scalping", r: -1.1, daysAgo: 10, note: "Chased the breakdown after the move." },
  { symbol: "NASDAQ", direction: "short", strategy: "day", r: -1.8, daysAgo: 9, note: "Counter-trend. Fought the tape." },
  { symbol: "ETH/USD", direction: "long", strategy: "swing", r: 2.5, daysAgo: 8, note: "Compression breakout, textbook trigger." },
  { symbol: "XAU/USD", direction: "long", strategy: "day", r: 1.3, daysAgo: 7, note: "Scaled in at support." },
  { symbol: "GBP/USD", direction: "long", strategy: "scalping", r: -1, daysAgo: 6, note: "Spread ate the edge." },
  { symbol: "BTC/USD", direction: "long", strategy: "swing", r: 2.1, daysAgo: 5, note: "Held the structure. Good process." },
  { symbol: "AAPL", direction: "short", strategy: "day", r: -1.2, daysAgo: 4, note: "Faded a strong stock. Wrong side." },
  { symbol: "S&P 500", direction: "long", strategy: "swing", r: 1.9, daysAgo: 3, note: "Bought the dip with the trend." },
  { symbol: "ETH/USD", direction: "short", strategy: "scalping", r: -1.4, daysAgo: 2, note: "Overtraded the chop." },
  { symbol: "XAU/USD", direction: "long", strategy: "swing", r: 2.7, daysAgo: 1, note: "Clean trend entry off the 20 EMA." },
  { symbol: "BTC/USD", direction: "long", strategy: "day", r: 1.5, daysAgo: 0, note: "Intraday continuation, closed before the news." },
];

async function main() {
  getDb();
  const provider = new DemoMarketDataProvider();

  // This account is a real login, so a restart must not wipe it: it is only
  // rebuilt from scratch when SEED_RESET=1.
  const targetEmail = EMAIL;

  const existing = queryOne<{ id: string }>("SELECT id FROM users WHERE email = ?", [targetEmail]);
  let userId: string;

  if (existing) {
    userId = existing.id;
    if (process.env.SEED_RESET !== "1") {
      execute("UPDATE users SET plan = ?, onboarded_at = COALESCE(onboarded_at, ?) WHERE id = ?", [PLAN, Date.now(), userId]);
      console.log(`\nAccount ready (unchanged):\n  email:    ${targetEmail}\n  plan:     ${PLAN}\n  password: unchanged\n`);
      return;
    }
    console.log(`Resetting workspace for ${targetEmail}`);
    execute("DELETE FROM paper_positions WHERE user_id = ?", [userId]);
    execute("DELETE FROM journal_entries WHERE user_id = ?", [userId]);
    execute("DELETE FROM alerts WHERE user_id = ?", [userId]);
    execute("DELETE FROM alert_events WHERE user_id = ?", [userId]);
    execute("DELETE FROM chat_messages WHERE user_id = ?", [userId]);
    execute("DELETE FROM watchlist WHERE user_id = ?", [userId]);
  } else {
    userId = newId("usr");
    execute(
      "INSERT INTO users (id, email, name, password_hash, plan, created_at, onboarded_at, preferences) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        userId,
        targetEmail,
        NAME,
        hashPassword(PASSWORD),
        PLAN,
        Date.now() - 60 * DAY,
        Date.now() - 59 * DAY,
        JSON.stringify({}),
      ],
    );
    console.log(`Created account (${targetEmail})`);
  }

  execute("UPDATE users SET plan = ?, onboarded_at = ? WHERE id = ?", [PLAN, Date.now() - 59 * DAY, userId]);
  updatePreferences(userId, {
    markets: ["crypto", "forex", "commodities"],
    style: "swing",
    experience: "intermediate",
    riskPreference: "moderate",
    defaultRiskPct: 1,
    defaultBalance: 25_000,
    currency: "USD",
  });

  if (!WITH_SAMPLE_DATA) {
    console.log(`\nWorkspace ready (clean):\n  email:    ${EMAIL}\n  password: ${PASSWORD}\n  plan:     ${PLAN}\n`);
    return;
  }

  for (const symbol of ["BTC/USD", "ETH/USD", "XAU/USD", "EUR/USD", "NASDAQ"]) {
    addWatchlist(userId, symbol);
  }

  // ── Journal history ──────────────────────────────────────────
  let created = 0;
  for (const trade of HISTORY) {
    const bundle = await provider.getBundle(trade.symbol);
    const daily = bundle.series["1d"];
    const closeIdx = Math.max(1, daily.length - 1 - trade.daysAgo);
    const candle = daily[Math.min(closeIdx, daily.length - 1)];

    // Build entry/stop/exit consistent with the intended R multiple.
    const dir = trade.direction === "long" ? 1 : -1;
    const entry = candle.c;
    const stopPct = trade.strategy === "scalping" ? 0.004 : trade.strategy === "day" ? 0.01 : 0.022;
    const stop = entry * (1 - dir * stopPct);
    const riskPerUnit = Math.abs(entry - stop);
    // Deterministic size so notional stays plausible vs the 25k account.
    const riskAmount = 250; // 1% of 25k
    const size = riskAmount / riskPerUnit;
    const exit = entry + dir * riskPerUnit * trade.r;

    createJournalEntry(userId, {
      symbol: trade.symbol,
      direction: trade.direction,
      entry: Number(entry.toFixed(4)),
      exit: Number(exit.toFixed(4)),
      stop: Number(stop.toFixed(4)),
      takeProfit: Number((entry + dir * riskPerUnit * 3).toFixed(4)),
      size: Number(size.toFixed(6)),
      strategy: trade.strategy,
      result: trade.r > 0.05 ? "win" : trade.r < -0.05 ? "loss" : "breakeven",
      pnl: Number((riskAmount * trade.r).toFixed(2)),
      notes: trade.note,
      tags: trade.r < 0 ? ["review"] : [],
      openedAt: Date.now() - trade.daysAgo * DAY - 4 * 3_600_000,
      closedAt: Date.now() - trade.daysAgo * DAY,
      rMultiple: trade.r,
    } satisfies Omit<JournalEntry, "id">);
    created += 1;
  }

  // ── Open paper positions ─────────────────────────────────────
  // Entry offsets are small and realistic so the open book shows a genuine
  // mix of winners and losers at the current mark.
  const openPlans = [
    { symbol: "BTC/USD", direction: "long" as const, risk: 250, entryOffset: -0.013 },
    { symbol: "ETH/USD", direction: "long" as const, risk: 250, entryOffset: 0.009 },
    { symbol: "XAU/USD", direction: "short" as const, risk: 200, entryOffset: -0.006 },
  ];

  for (const plan of openPlans) {
    const quote = await provider.getQuote(plan.symbol);
    const dir = plan.direction === "long" ? 1 : -1;
    const stopPct = 0.018;
    // Entered below the current mark for longs (in profit), above for shorts.
    const entry = quote.price * (1 + plan.entryOffset);
    const stop = entry * (1 - dir * stopPct);
    const size = plan.risk / Math.abs(entry - stop);
    createPosition(userId, {
      symbol: plan.symbol,
      direction: plan.direction,
      entry: Number(entry.toFixed(4)),
      size: Number(size.toFixed(6)),
      stop: Number(stop.toFixed(4)),
      takeProfit: Number((entry + dir * Math.abs(entry - stop) * 2.5).toFixed(4)),
      setupId: null,
      notes: "Seeded position for the demo workspace.",
      source: "manual",
      openedAt: Date.now() - 2 * DAY,
    });
  }

  // ── Alerts ───────────────────────────────────────────────────
  const btc = await provider.getQuote("BTC/USD");
  execute(
    "INSERT INTO alerts (id, user_id, symbol, kind, value, note, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    [newId("alr"), userId, "BTC/USD", "price-above", Number((btc.price * 1.02).toFixed(0)), "Notify me when BTC enters the AI setup zone", Date.now()],
  );
  execute(
    "INSERT INTO alerts (id, user_id, symbol, kind, value, note, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    [newId("alr"), userId, "XAU/USD", "ai-opportunity", null, "Tell me when gold produces a high-confluence setup", Date.now()],
  );

  console.log(
    [
      "",
      "Demo workspace ready:",
      `  email:    ${EMAIL}`,
      `  password: ${PASSWORD}`,
      `  plan:     ${PLAN} (demo billing)`,
      `  journal:  ${created} trades`,
      `  paper:    ${openPlans.length} open positions`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
