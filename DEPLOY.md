# Deploying TRADIA AI

This app is a **Next.js server** (App Router, route handlers, `node:sqlite`), so it
needs a long-lived Node process — not a static host and not an edge runtime.

## The one constraint that decides everything

Storage is SQLite on disk (`data/tradia.db`). That has a direct consequence:

| Host type | Works? | Why |
| --- | --- | --- |
| VPS / Docker with a volume | ✅ | Disk persists across restarts and deploys |
| Render / Railway / Fly **with a volume** | ✅ | Same reason (paid tiers) |
| Render free / Railway trial / Fly trial | ⚠️ | **No persistent disk.** Data is wiped on every restart or idle spin-down |
| Vercel / Netlify / Cloudflare | ❌ | Serverless: no writable disk, and `node:sqlite` is not available |

On the free tiers the filesystem resets, which would normally mean losing your
account on every cold start. This repo handles that: `scripts/bootstrap.mjs`
re-creates the account from environment variables before the server boots.

Because free instances also **sleep after idle**, expect the first request after
a pause to take ~30–60 s while the container wakes.

## Render (free, no credit card)

1. Push this branch and open <https://dashboard.render.com/blueprints>.
2. **New → Blueprint**, connect the `trader-ai` repo. Render reads `render.yaml`.
3. When prompted for the `sync: false` variables, set:
   - `SEED_EMAIL` — the address you want to log in with
   - `SEED_PASSWORD` — a password you choose (12+ characters)
4. Apply. First build takes a few minutes (Docker + `npm ci` + `next build`).

You get a public URL like `https://tradia-ai.onrender.com` that works in any
browser, outside the Arena panel.

Useful optional variables:

| Variable | Effect |
| --- | --- |
| `SEED_SAMPLE_DATA=0` | Skip the 30-trade journal and sample positions — a clean workspace |
| `SEED_PLAN=free` | Provision the account on the Free plan to test upgrade gating |
| `SEED_NAME` | Display name for the account |

Leaving `SEED_SAMPLE_DATA=1` gives you the full populated experience (journal
insights, portfolio curves, paper positions) immediately after sign-in.

## Any Docker host

```bash
docker build -t tradia-ai .
docker run -p 3000:3000 \
  -e SEED_EMAIL=you@example.com \
  -e SEED_PASSWORD='a-strong-password' \
  -e TRADIA_SESSION_SECRET="$(openssl rand -hex 32)" \
  -v tradia-data:/app/data \
  tradia-ai
```

The `-v` mount is what makes the data survive. Without it the container behaves
like a free tier and re-provisions on each start.

## Local

```bash
npm install
npm run db:seed     # demo@tradia.ai / tradia1234
npm run dev         # http://localhost:3000
```

Locally `SEED_EMAIL` is usually unset, so `npm start` skips provisioning and your
existing `data/tradia.db` is left alone.

## Before real users

- Set `TRADIA_SESSION_SECRET` to a long random value (Render generates one).
- Keep `MARKET_DATA_PROVIDER=demo` until a live provider is wired; every payload
  is badged with its source, so demo prices are never presented as live.
- Free-tier SQLite suits evaluation only. For real data, move to a host with a
  persistent volume, or replace `src/lib/db/index.ts` with a Postgres-backed
  implementation — every repository goes through that one module, so nothing
  else needs to change.
