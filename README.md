# TRADIA AI

An AI trading-intelligence product for traders: market analysis, opportunity detection, risk
sizing, paper trading and journal coaching — built as a real SaaS application, not a dashboard
mockup.

The core loop the product is designed around:

**Market data → AI analysis → opportunity detection → risk analysis → your decision → review**

TRADIA AI provides analysis and educational information. It does not guarantee trading results.

---

## Quick start

```bash
npm install
cp .env.example .env          # optional for local demo mode
npm run dev                   # http://localhost:3000
```

Optional — populate a realistic workspace (30 journal trades, 3 open paper positions, alerts):

```bash
npm run db:seed
# then sign in with demo@tradia.ai / tradia1234
```

Or create a fresh account at `/register` and walk the six-step onboarding.

```bash
npm test          # 39 engine tests (risk, setups, portfolio, journal, copilot)
npm run typecheck
npm run build && npm start
```

---

## Product areas

| Area | What it does |
| --- | --- |
| **Home** | Daily Market Briefing: majors, ranked opportunities, volatility, calendar, risk notes, account snapshot |
| **AI Analyst** | The core feature — pick an instrument, run *Analyze with AI*, get overview, regime, 7-timeframe matrix, bias with reasoning, scenarios, setups, invalidation |
| **Market Scanner** | Ranks the universe by confluence through the same pipeline, filtered by markets / strategy / risk appetite |
| **Signals** | Opportunity feed + alert rules (price, breakout, trend change, AI opportunity, volatility) with triggered events |
| **Charts** | Candles, volume, EMA 20/50, mapped S/R levels, and AI setup levels (entry zone / stop / target) drawn on the chart |
| **Risk Manager** | Position size, dollar risk, R multiple, break-even win rate, portfolio heat, margin — recalculated live |
| **Portfolio** | Equity curve, 30-day P&L, drawdown, profit factor, allocation, open exposure (paper only, always labelled) |
| **Trading Journal** | Record trades, then AI analysis of style edge, payoff asymmetry, entry timing, loss clustering (sample-size guarded) |
| **Paper Trading** | Full virtual lifecycle: open, modify stops, close, realise P&L, copy to journal |
| **AI Chat** | Grounded copilot over the workspace's own data; explicitly declines when data is unavailable |
| **Settings** | Preferences, risk defaults, watchlist, plan/billing, data-source transparency, account |

---

## Architecture

```
src/
├─ app/
│  ├─ page.tsx                 marketing / landing
│  ├─ (auth)/                  login, register
│  ├─ onboarding/              6-step personalisation wizard
│  ├─ app/                     authenticated product (13 routes)
│  ├─ legal/[slug]/            terms, privacy, risk disclosure
│  └─ api/                     route handlers (all AI + market work is server-side)
│
├─ lib/
│  ├─ types.ts                 domain contracts shared by every layer
│  ├─ instruments.ts           reference catalogue (identifiers, tick sizes — no prices)
│  ├─ indicators.ts            EMA/SMA/RSI/MACD/ATR/BB/Stoch/OBV/ADX/pivots
│  ├─ auth.ts                  scrypt hashing + hashed-token sessions
│  ├─ plan.ts                  entitlements + daily usage metering
│  ├─ api-helpers.ts           JSON errors, auth wrapper, analysis cache, rate limit
│  │
│  ├─ market-data/             ← swappable data layer
│  │  ├─ types.ts              MarketDataProvider contract
│  │  ├─ demo.ts               deterministic DEMO provider (labelled everywhere)
│  │  ├─ http.ts               generic REST adapter for any vendor
│  │  └─ index.ts              provider selection via env
│  │
│  ├─ ai/                      ← the AI engine, specialised modules
│  │  ├─ technical.ts          per-timeframe trend/momentum/volatility scoring
│  │  ├─ regime.ts             trending / ranging / compression / high-volatility
│  │  ├─ market.ts             structure, S/R, overview, MTF aggregation
│  │  ├─ opportunity.ts        setups: entry zone, stop, targets, invalidation
│  │  ├─ narrative.ts          prose from structured output (+ optional LLM polish)
│  │  ├─ analyze.ts            orchestrator
│  │  └─ chat.ts               grounded copilot intent routing
│  │
│  ├─ engines/
│  │  ├─ risk.ts               pure position-sizing math
│  │  ├─ portfolio.ts          equity, drawdown, exposure
│  │  ├─ journal.ts            behavioural insights (sample-size aware)
│  │  ├─ scanner.ts            universe ranking
│  │  ├─ briefing.ts           daily synthesis
│  │  └─ alerts.ts             rule evaluation
│  │
│  └─ db/                      SQLite (node:sqlite) + repositories
│
└─ components/                 UI: shell, chart, and one workspace per product area
```

**Layering rules enforced in the code:**

- Market data is never hard-coded in the UI — it always comes through `MarketDataProvider`.
- Engines are pure functions; they take data, return data, and never touch React or the DB.
- Route handlers are the only place that combines auth + plan limits + engines + storage.
- No provider credential is reachable from the client; `NEXT_PUBLIC_*` holds nothing sensitive.

---

## Market data: demo vs live

The product ships with a deterministic **DEMO** provider so the entire loop is usable with zero
credentials. Demo prices are **labelled on every screen that shows them** (`DEMO DATA` badge, plus a
`sources`/`dataDisclaimer` field on every payload). Demo data is never presented as live.

To connect a real feed:

```bash
MARKET_DATA_PROVIDER=http
MARKET_DATA_BASE_URL=https://your-provider.example.com/v1
MARKET_DATA_API_KEY=...
```

The adapter expects `GET /ohlcv?symbol=&interval=&limit=` and `GET /quote?symbol=`, returning the
shapes documented in `src/lib/market-data/http.ts`. Mapping a different vendor means changing one
file — nothing downstream knows the difference. If a live provider is selected but unreachable, the
API fails loudly rather than silently substituting simulated prices.

---

## The AI engine

Deterministic and inspectable, in keeping with "accuracy + explanation + risk awareness over signal
volume":

1. **Technical analyzer** — EMA stack, RSI, MACD, ADX, slope, volume ratio, range position → −100…100
2. **Regime detector** — classifies the environment so tactics match conditions
3. **Market analyzer** — swing structure (HH/HL vs LH/LL), pivots clustered into S/R levels
4. **Bias aggregation** — hierarchy-weighted across 1m…1W (higher timeframes set direction)
5. **Opportunity detector** — confluence accounting, entry *zone*, volatility-bounded stop, level- or
   R-derived target, explicit invalidation, maturity penalty when the move is already extended
6. **Narrative** — prose written from those numbers; an optional LLM may only rephrase, and output
   that introduces new numbers is rejected

Design choices that matter:

- A ranging or high-volatility regime **cannot** produce a "high quality" setup.
- No setup is emitted without a stop and at least three invalidation conditions.
- Confidence is an estimate of **confluence**, bounded to 22–79, never a probability of profit.
- Free plans analyse all timeframes internally but display four — the engine never sees a handicap.

---

## Plans

`src/lib/plan.ts` holds entitlements and server-enforced daily meters.

| | Free | Pro |
| --- | --- | --- |
| AI analyses | 8 / day | unlimited |
| Timeframes | 4 (style-selected) | all 7 |
| Scanner | 5 runs, top 6 | unlimited, top 15 |
| Copilot | 25 messages/day | unlimited |
| Journal analytics | locked | full |
| Portfolio analytics | locked | full |
| Alerts | 3 | 50 |
| Paper positions | 12 open | unlimited |

Billing is **simulated** in this build: the upgrade flips entitlements locally so the Pro experience
can be evaluated end-to-end (no payment is taken). In production, `POST /api/plan` is where a billing
webhook would verify payment — the entitlement layer itself does not change.

---

## Security

- Passwords: scrypt (N=16384, r=8, p=1) with a per-user salt, constant-time verification.
- Sessions: opaque 256-bit tokens in httpOnly / SameSite=Lax cookies; only a SHA-256 hash is stored.
- Rate limiting on login and registration.
- Plan limits enforced server-side; a blocked request never consumes quota.
- All market-data and AI-provider credentials are read server-side only.

---

## Testing

`npm test` runs 39 assertions against the parts where a silent error becomes a trading loss:

- risk sizing must reproduce the intended dollar risk across risk % and stop widths
- rejected trades: wrong-side stops and targets, missing stop, reckless risk %
- setup geometry: ordered entry zones, stop/target on the correct side, R/R reproducible from the
  published levels, entry zones reachable from the market
- portfolio: realised/unrealised separation, profit factor, max drawdown, long/short P&L signs
- journal: refuses to generalise below the sample floor, detects payoff asymmetry and style edge
- copilot: intent routing, alias resolution, and that it declines rather than inventing data
- market data: determinism, candle integrity, demo labelling

Several of these tests found and fixed real bugs during development (inverted stop validation, an
unreachable entry zone on high timeframes, drawdown hidden by curve downsampling, R/R inconsistent
between the entry edge and the midpoint, and a substring alias matching "eth" inside "something").

---

## Environment

See `.env.example`. Nothing is required for demo mode; the app runs with defaults.

| Variable | Purpose |
| --- | --- |
| `TRADIA_DB_PATH` | SQLite location (default `./data/tradia.db`) |
| `MARKET_DATA_PROVIDER` | `demo` (default), `http`, or `auto` |
| `MARKET_DATA_API_KEY` / `_BASE_URL` | live feed credentials (server-side only) |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | optional narrative polish |

---

## Scope note

This is a production-oriented product build, not a finished commercial service. Deliberately
simulated: billing, broker execution and email/push alert delivery (the alert *engine* is real;
delivery is a pluggable transport). Deliberately absent: backtesting and broker integrations, which
are Phase 3 in the roadmap because they depend on a broker/execution layer that does not exist yet.

---

## Disclaimer

TRADIA AI provides market analysis and educational information and does not guarantee trading
results. Setups are potential scenarios derived from available market data — not recommendations or
certainties. Prices may be delayed or simulated; check the data-source badge. Trading involves
substantial risk of loss. You are solely responsible for your decisions.

## Deployment

Free, public URL outside the development panel: see **[DEPLOY.md](./DEPLOY.md)**.
Short version — Render's free Docker tier + `render.yaml`, with the account
re-provisioned from `SEED_EMAIL`/`SEED_PASSWORD` on each boot because free hosts
have no persistent disk.
