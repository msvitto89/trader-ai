/**
 * Production entrypoint for hosts without a persistent disk.
 *
 * Free tiers (Render, Railway trial, Fly trial) wipe the filesystem between
 * restarts, so a seeded SQLite file never survives. This wrapper recreates the
 * account from environment variables before the server boots, which makes the
 * login stable across cold starts.
 *
 *   SEED_EMAIL=you@example.com
 *   SEED_PASSWORD=...        (set these in the host's dashboard)
 *   SEED_SAMPLE_DATA=1       sample journal + positions for a demo feel
 *   SEED_SAMPLE_DATA=0       empty workspace, no sample trades
 *
 * Runs only when SEED_EMAIL and SEED_PASSWORD are present, so normal local
 * development is unaffected.
 */

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const email = process.env.SEED_EMAIL;
const password = process.env.SEED_PASSWORD;

function seed() {
  execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
}

function resetDatabase() {
  const path = resolve(process.cwd(), process.env.TRADIA_DB_PATH ?? "./data/tradia.db");
  for (const suffix of ["", "-shm", "-wal"]) {
    rmSync(`${path}${suffix}`, { force: true });
  }
  console.log("[bootstrap] removed unusable database files");
}

if (!email || !password) {
  console.log("[bootstrap] SEED_EMAIL/SEED_PASSWORD not set — skipping account provisioning.");
} else {
  console.log(`[bootstrap] provisioning account ${email}`);
  try {
    seed();
  } catch {
    // A half-written SQLite file (e.g. a container killed mid-write) makes
    // further writes fail with "disk I/O error". Start clean and retry once.
    console.error("[bootstrap] seeding failed — resetting database and retrying");
    try {
      resetDatabase();
      seed();
    } catch {
      // Never block the server on seeding: a failed seed should still let the
      // app boot so the operator can register manually.
      console.error("[bootstrap] retry failed — booting without a provisioned account");
    }
  }
}
