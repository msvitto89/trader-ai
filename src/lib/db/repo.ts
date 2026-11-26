/**
 * Repositories — the only place SQL lives. Route handlers and engines talk to
 * these functions, never to the database directly, which keeps the storage
 * layer replaceable.
 */

import { execute, newId, queryAll, queryOne } from "./index";
import type {
  AlertEvent,
  AlertRule,
  ChatMessage,
  Direction,
  JournalEntry,
  Position,
  TradingStyle,
} from "../types";

/* ── Watchlist ─────────────────────────────────────────────── */

export function getWatchlist(userId: string): string[] {
  return queryAll<{ symbol: string }>(
    "SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY added_at",
    [userId],
  ).map((r) => r.symbol);
}

export function addWatchlist(userId: string, symbol: string): void {
  execute(
    "INSERT INTO watchlist (user_id, symbol, added_at) VALUES (?, ?, ?) ON CONFLICT(user_id, symbol) DO NOTHING",
    [userId, symbol, Date.now()],
  );
}

export function removeWatchlist(userId: string, symbol: string): void {
  execute("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?", [userId, symbol]);
}

/* ── Paper positions ───────────────────────────────────────── */

interface PositionRow {
  id: string;
  user_id: string;
  symbol: string;
  direction: string;
  entry: number;
  size: number;
  stop: number | null;
  take_profit: number | null;
  opened_at: number;
  closed_at: number | null;
  exit_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  setup_id: string | null;
  notes: string;
  source: string;
}

function toPosition(row: PositionRow): Position {
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction as Direction,
    entry: row.entry,
    size: row.size,
    stop: row.stop,
    takeProfit: row.take_profit,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    exitPrice: row.exit_price,
    pnl: row.pnl,
    pnlPct: row.pnl_pct,
    setupId: row.setup_id,
    notes: row.notes,
    source: row.source === "ai-setup" ? "ai-setup" : "manual",
  };
}

export function listPositions(userId: string, opts?: { openOnly?: boolean; limit?: number }): Position[] {
  const sql = opts?.openOnly
    ? "SELECT * FROM paper_positions WHERE user_id = ? AND closed_at IS NULL ORDER BY opened_at DESC"
    : `SELECT * FROM paper_positions WHERE user_id = ? ORDER BY opened_at DESC LIMIT ${Number(opts?.limit ?? 300)}`;
  return queryAll<PositionRow>(sql, [userId]).map(toPosition);
}

export function countOpenPositions(userId: string): number {
  return queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM paper_positions WHERE user_id = ? AND closed_at IS NULL",
    [userId],
  )?.n ?? 0;
}

export function createPosition(
  userId: string,
  input: Omit<Position, "id" | "closedAt" | "exitPrice" | "pnl" | "pnlPct" | "openedAt"> & { openedAt?: number },
): Position {
  const id = newId("pos");
  execute(
    `INSERT INTO paper_positions
     (id, user_id, symbol, direction, entry, size, stop, take_profit, opened_at, setup_id, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.symbol,
      input.direction,
      input.entry,
      input.size,
      input.stop,
      input.takeProfit,
      input.openedAt ?? Date.now(),
      input.setupId,
      input.notes ?? "",
      input.source,
    ],
  );
  const row = queryOne<PositionRow>("SELECT * FROM paper_positions WHERE id = ?", [id]);
  return toPosition(row!);
}

export function closePositionRecord(
  userId: string,
  id: string,
  exitPrice: number,
  pnl: number,
  pnlPct: number,
): Position | null {
  execute(
    "UPDATE paper_positions SET closed_at = ?, exit_price = ?, pnl = ?, pnl_pct = ? WHERE id = ? AND user_id = ?",
    [Date.now(), exitPrice, pnl, pnlPct, id, userId],
  );
  const row = queryOne<PositionRow>("SELECT * FROM paper_positions WHERE id = ?", [id]);
  return row ? toPosition(row) : null;
}

export function updatePositionLevels(
  userId: string,
  id: string,
  stop: number | null,
  takeProfit: number | null,
): void {
  execute("UPDATE paper_positions SET stop = ?, take_profit = ? WHERE id = ? AND user_id = ?", [
    stop,
    takeProfit,
    id,
    userId,
  ]);
}

export function deletePosition(userId: string, id: string): void {
  execute("DELETE FROM paper_positions WHERE id = ? AND user_id = ?", [id, userId]);
}

/* ── Journal ───────────────────────────────────────────────── */

interface JournalRow {
  id: string;
  symbol: string;
  direction: string;
  entry: number;
  exit_price: number;
  stop: number | null;
  take_profit: number | null;
  size: number;
  strategy: string;
  result: string;
  pnl: number;
  notes: string;
  tags: string;
  opened_at: number;
  closed_at: number;
  r_multiple: number | null;
}

function toJournal(row: JournalRow): JournalEntry {
  let tags: string[];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction as Direction,
    entry: row.entry,
    exit: row.exit_price,
    stop: row.stop,
    takeProfit: row.take_profit,
    size: row.size,
    strategy: row.strategy as JournalEntry["strategy"],
    result: row.result as JournalEntry["result"],
    pnl: row.pnl,
    notes: row.notes,
    tags,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    rMultiple: row.r_multiple,
  };
}

export function listJournal(userId: string, limit = 300): JournalEntry[] {
  return queryAll<JournalRow>(
    `SELECT * FROM journal_entries WHERE user_id = ? ORDER BY closed_at DESC LIMIT ${Number(limit)}`,
    [userId],
  ).map(toJournal);
}

export function createJournalEntry(
  userId: string,
  input: Omit<JournalEntry, "id">,
): JournalEntry {
  const id = newId("jrn");
  execute(
    `INSERT INTO journal_entries
     (id, user_id, symbol, direction, entry, exit_price, stop, take_profit, size, strategy, result, pnl, notes, tags, opened_at, closed_at, r_multiple)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.symbol,
      input.direction,
      input.entry,
      input.exit,
      input.stop,
      input.takeProfit,
      input.size,
      input.strategy,
      input.result,
      input.pnl,
      input.notes,
      JSON.stringify(input.tags),
      input.openedAt,
      input.closedAt,
      input.rMultiple,
    ],
  );
  const row = queryOne<JournalRow>("SELECT * FROM journal_entries WHERE id = ?", [id]);
  return toJournal(row!);
}

export function updateJournalEntry(
  userId: string,
  id: string,
  patch: { notes?: string; tags?: string[]; strategy?: TradingStyle | "other" },
): void {
  const row = queryOne<JournalRow>("SELECT * FROM journal_entries WHERE id = ? AND user_id = ?", [id, userId]);
  if (!row) return;
  execute("UPDATE journal_entries SET notes = ?, tags = ?, strategy = ? WHERE id = ? AND user_id = ?", [
    patch.notes ?? row.notes,
    JSON.stringify(patch.tags ?? JSON.parse(row.tags || "[]")),
    patch.strategy ?? row.strategy,
    id,
    userId,
  ]);
}

export function deleteJournalEntry(userId: string, id: string): void {
  execute("DELETE FROM journal_entries WHERE id = ? AND user_id = ?", [id, userId]);
}

/* ── Alerts ────────────────────────────────────────────────── */

interface AlertRow {
  id: string;
  symbol: string;
  kind: string;
  value: number | null;
  note: string;
  active: number;
  created_at: number;
}

export function listAlerts(userId: string): AlertRule[] {
  return queryAll<AlertRow>("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC", [userId]).map(
    (r) => ({
      id: r.id,
      symbol: r.symbol,
      kind: r.kind as AlertRule["kind"],
      value: r.value,
      note: r.note,
      active: r.active === 1,
      createdAt: r.created_at,
    }),
  );
}

export function createAlert(
  userId: string,
  input: { symbol: string; kind: AlertRule["kind"]; value: number | null; note: string },
): AlertRule {
  const id = newId("alr");
  execute("INSERT INTO alerts (id, user_id, symbol, kind, value, note, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)", [
    id,
    userId,
    input.symbol,
    input.kind,
    input.value,
    input.note,
    Date.now(),
  ]);
  return {
    id,
    symbol: input.symbol,
    kind: input.kind,
    value: input.value,
    note: input.note,
    active: true,
    createdAt: Date.now(),
  };
}

export function toggleAlert(userId: string, id: string, active: boolean): void {
  execute("UPDATE alerts SET active = ? WHERE id = ? AND user_id = ?", [active ? 1 : 0, id, userId]);
}

export function deleteAlert(userId: string, id: string): void {
  execute("DELETE FROM alerts WHERE id = ? AND user_id = ?", [id, userId]);
}

export function listAlertEvents(userId: string, limit = 40): AlertEvent[] {
  return queryAll<{
    id: string;
    rule_id: string | null;
    symbol: string;
    kind: string;
    title: string;
    detail: string;
    created_at: number;
    read: number;
  }>(`SELECT * FROM alert_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ${Number(limit)}`, [userId]).map(
    (r) => ({
      id: r.id,
      ruleId: r.rule_id,
      symbol: r.symbol,
      kind: r.kind as AlertRule["kind"],
      title: r.title,
      detail: r.detail,
      createdAt: r.created_at,
      read: r.read === 1,
    }),
  );
}

export function createAlertEvent(
  userId: string,
  input: Omit<AlertEvent, "id" | "createdAt" | "read">,
): void {
  execute(
    "INSERT INTO alert_events (id, user_id, rule_id, symbol, kind, title, detail, created_at, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
    [newId("evt"), userId, input.ruleId, input.symbol, input.kind, input.title, input.detail, Date.now()],
  );
}

export function markAlertsRead(userId: string): void {
  execute("UPDATE alert_events SET read = 1 WHERE user_id = ?", [userId]);
}

/* ── Chat ──────────────────────────────────────────────────── */

interface ChatRow {
  id: string;
  role: string;
  content: string;
  blocks: string | null;
  sources: string | null;
  created_at: number;
}

export function listChat(userId: string, limit = 100): ChatMessage[] {
  return queryAll<ChatRow>(
    `SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ${Number(limit)}`,
    [userId],
  )
    .map((r) => ({
      id: r.id,
      role: r.role === "user" ? ("user" as const) : ("assistant" as const),
      content: r.content,
      createdAt: r.created_at,
      blocks: r.blocks ? (JSON.parse(r.blocks) as ChatMessage["blocks"]) : undefined,
      sources: r.sources ? (JSON.parse(r.sources) as string[]) : undefined,
    }))
    .reverse();
}

export function saveChatMessage(userId: string, message: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  const id = newId("msg");
  const createdAt = Date.now();
  execute(
    "INSERT INTO chat_messages (id, user_id, role, content, blocks, sources, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      userId,
      message.role,
      message.content,
      message.blocks ? JSON.stringify(message.blocks) : null,
      message.sources ? JSON.stringify(message.sources) : null,
      createdAt,
    ],
  );
  return { ...message, id, createdAt };
}

export function clearChat(userId: string): void {
  execute("DELETE FROM chat_messages WHERE user_id = ?", [userId]);
}

/* ── Saved setups ──────────────────────────────────────────── */

export function saveSetup(userId: string, payload: unknown): void {
  execute("INSERT INTO saved_setups (id, user_id, payload, created_at) VALUES (?, ?, ?, ?)", [
    newId("svd"),
    userId,
    JSON.stringify(payload),
    Date.now(),
  ]);
}

export function listSavedSetups(userId: string): unknown[] {
  return queryAll<{ payload: string }>(
    "SELECT payload FROM saved_setups WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    [userId],
  ).map((r) => JSON.parse(r.payload));
}

/* ── Audit ─────────────────────────────────────────────────── */

export function audit(userId: string | null, action: string, detail = ""): void {
  execute("INSERT INTO audit_log (id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)", [
    newId("aud"),
    userId,
    action,
    detail,
    Date.now(),
  ]);
}
