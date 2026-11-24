/**
 * Database access. One connection per process, schema applied on first use.
 *
 * Uses node:sqlite (built into Node 22+) so the reference deployment needs no
 * native build step. Every repository in this folder takes the handle from
 * `getDb()`, which keeps storage swappable.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SCHEMA } from "./schema";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const path = process.env.TRADIA_DB_PATH ?? "./data/tradia.db";
  const absolute = resolve(process.cwd(), path);
  if (absolute !== ":memory:") {
    mkdirSync(dirname(absolute), { recursive: true });
  }
  db = new DatabaseSync(absolute);
  db.exec(SCHEMA);
  return db;
}

export type Row = Record<string, unknown>;

export function queryAll<T = Row>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...(params as never[])) as T[];
}

export function queryOne<T = Row>(sql: string, params: unknown[] = []): T | null {
  const stmt = getDb().prepare(sql);
  const row = stmt.get(...(params as never[]));
  return (row as T) ?? null;
}

export function execute(sql: string, params: unknown[] = []): void {
  const stmt = getDb().prepare(sql);
  stmt.run(...(params as never[]));
}

export function transaction<T>(fn: () => T): T {
  const handle = getDb();
  handle.exec("BEGIN");
  try {
    const result = fn();
    handle.exec("COMMIT");
    return result;
  } catch (err) {
    handle.exec("ROLLBACK");
    throw err;
  }
}

export function newId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
  return `${prefix}_${rand}`;
}
