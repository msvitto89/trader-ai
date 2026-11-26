/**
 * Production entrypoint for hosts without a persistent disk.
 *
 * Free tiers (Render, Railway trial, Fly trial) wipe the filesystem between
 * restarts, so a seeded SQLite file never survives. This wrapper re-creates a
 * working account before the server boots, which keeps the login stable across
 * cold starts.
 *
 * Defaults (see scripts/seed.ts) provision:
 *   trader@tradia.ai / TradiaPro2026!   — Pro, onboarded, sample workspace
 *
 * Override with env vars:
 *   PROVISION_EMAIL, PROVISION_PASSWORD  — your own credentials
 *   SEED_SAMPLE_DATA=0                   — empty workspace, no sample trades
 *   SEED_RESET=1                         — wipe and rebuild an existing account
 *
 * Set BOOTSTRAP=0 to skip provisioning entirely (e.g. on a host with a real
 * persistent disk where you manage accounts yourself).
 */

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const databasePath = resolve(
  process.cwd(),
  process.env.TRADIA_DB_PATH ?? "./data/tradia.db",
);

function seed() {
  execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
}

function resetDatabase() {
  for (const suffix of ["", "-shm", "-wal"]) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
  console.log("[bootstrap] removed unusable database files");
}

if (process.env.BOOTSTRAP === "0") {
  console.log("[bootstrap] BOOTSTRAP=0 — skipping provisioning.");
} else {
  console.log(`[bootstrap] database: ${databasePath}`);
  try {
    seed();
  } catch {
    // A half-written SQLite file (e.g. a container killed mid-write) makes
    // further writes fail with "disk I/O error". Start clean and retry once.
    console.error("[bootstrap] provisioning failed — resetting database and retrying");
    try {
      resetDatabase();
      seed();
    } catch {
      // Never block the server on seeding: a failed seed should still let the
      // app boot so you can register manually.
      console.error("[bootstrap] retry failed — booting without a provisioned account");
    }
  }
}
