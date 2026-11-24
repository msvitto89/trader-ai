/**
 * TRADIA AI — engine test suite.
 *
 * Run with: npm test
 *
 * These tests guard the parts of the product where a silent error becomes a
 * trading loss: position sizing, risk validation, setup geometry, portfolio
 * accounting and the journal's refusal to over-fit small samples.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateRisk } from "../engines/risk";
import { buildPortfolio, closePosition, positionMetrics } from "../engines/portfolio";
import { analyzeJournal, journalScorecard } from "../engines/journal";
import { DemoMarketDataProvider } from "../market-data/demo";
import { analyzeBundle } from "../ai/analyze";
import { detectSetups } from "../ai/opportunity";
import { aggregateBias } from "../ai/market";
import { analyzeTimeframe } from "../ai/technical";
import { resolveSymbol, detectIntent, buildReply, type ChatContext } from "../ai/chat";
import { ema, rsi, atr, findLevels } from "../indicators";
import type { Candle, JournalEntry, Position } from "../types";

/* ── Helpers ─────────────────────────────────────────────────── */

function makeCandles(n: number, start = 100, drift = 0.15, vol = 0.6): Candle[] {
  const out: Candle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    price = price * (1 + drift / 100) * (1 + ((i % 5) - 2) * 0.0005);
    const high = Math.max(open, price) * (1 + vol / 1000);
    const low = Math.min(open, price) * (1 - vol / 1000);
    out.push({ t: 1_700_000_000_000 + i * 3_600_000, o: open, h: high, l: low, c: price, v: 1000 + i * 3 });
  }
  return out;
}

function makeJournalEntry(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: `j${Math.random()}`,
    symbol: "BTC/USD",
    direction: "long",
    entry: 100,
    exit: 110,
    stop: 95,
    takeProfit: 120,
    size: 1,
    strategy: "swing",
    result: "win",
    pnl: 10,
    notes: "",
    tags: [],
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_100_000_000,
    rMultiple: 2,
    ...over,
  };
}

function makePosition(over: Partial<Position> = {}): Position {
  return {
    id: `p${Math.random()}`,
    symbol: "BTC/USD",
    direction: "long",
    entry: 100,
    size: 1,
    stop: 95,
    takeProfit: 120,
    openedAt: 1_700_000_000_000,
    closedAt: null,
    exitPrice: null,
    pnl: null,
    pnlPct: null,
    setupId: null,
    notes: "",
    source: "manual",
    ...over,
  };
}

/* ── Risk Engine ─────────────────────────────────────────────── */

describe("Risk Engine", () => {
  it("sizes a long position from balance, risk % and stop distance", () => {
    const r = calculateRisk({
      symbol: "BTC/USD",
      balance: 10_000,
      riskPct: 1,
      entry: 68_000,
      stop: 66_000,
      takeProfit: 74_000,
      direction: "long",
    });
    assert.equal(r.valid, true);
    // $100 risk over a $2000 stop distance = 0.05 units.
    assert.equal(r.maxRiskAmount, 100);
    assert.equal(r.positionSize, 0.05);
    assert.equal(r.notional, 3400);
    assert.equal(r.riskReward, 3);
    assert.equal(r.potentialProfit, 300);
  });

  it("rejects a long whose stop is above the entry", () => {
    const r = calculateRisk({
      symbol: "BTC/USD",
      balance: 10_000,
      riskPct: 1,
      entry: 100,
      stop: 110,
      takeProfit: 130,
      direction: "long",
    });
    assert.equal(r.valid, false);
    assert.match(r.errors.join(" "), /stop must be below the entry/i);
  });

  it("rejects a short whose stop is below the entry", () => {
    const r = calculateRisk({
      symbol: "EUR/USD",
      balance: 10_000,
      riskPct: 1,
      entry: 1.1,
      stop: 1.09,
      takeProfit: 1.07,
      direction: "short",
    });
    assert.equal(r.valid, false);
    assert.match(r.errors.join(" "), /stop must be above the entry/i);
  });

  it("rejects a target on the wrong side", () => {
    const r = calculateRisk({
      symbol: "BTC/USD",
      balance: 10_000,
      riskPct: 1,
      entry: 100,
      stop: 90,
      takeProfit: 95,
      direction: "long",
    });
    assert.equal(r.valid, false);
    assert.match(r.errors.join(" "), /take profit must be above/i);
  });

  it("blocks reckless risk percentages", () => {
    const r = calculateRisk({
      symbol: "BTC/USD",
      balance: 1000,
      riskPct: 60,
      entry: 100,
      stop: 90,
      takeProfit: 130,
      direction: "long",
    });
    assert.equal(r.valid, false);
    assert.match(r.errors.join(" "), /blocked/i);
  });

  it("requires a stop — an unprotected trade cannot be sized", () => {
    const r = calculateRisk({
      symbol: "BTC/USD",
      balance: 1000,
      riskPct: 1,
      entry: 100,
      stop: Number.NaN,
      takeProfit: 130,
      direction: "long",
    });
    assert.equal(r.valid, false);
    assert.match(r.errors.join(" "), /stop loss is required/i);
  });

  it("warns when reward-to-risk is below 1", () => {
    const r = calculateRisk({
      symbol: "BTC/USD",
      balance: 10_000,
      riskPct: 1,
      entry: 100,
      stop: 90,
      takeProfit: 104,
      direction: "long",
    });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => /reward-to-risk/i.test(w)));
  });

  it("computes margin when leverage is supplied", () => {
    const r = calculateRisk({
      symbol: "BTC/USD",
      balance: 10_000,
      riskPct: 2,
      entry: 100,
      stop: 95,
      takeProfit: 115,
      direction: "long",
      leverage: 10,
    });
    assert.equal(r.valid, true);
    assert.equal(r.marginRequired, Number((r.notional / 10).toFixed(2)));
  });

  it("never returns a negative or NaN position size for valid input", () => {
    for (const risk of [0.1, 1, 3]) {
      for (const stopPct of [0.5, 2, 8]) {
        const r = calculateRisk({
          symbol: "XAU/USD",
          balance: 50_000,
          riskPct: risk,
          entry: 2650,
          stop: 2650 * (1 - stopPct / 100),
          takeProfit: 2650 * (1 + (stopPct * 2) / 100),
          direction: "long",
        });
        assert.equal(r.valid, true);
        assert.ok(r.positionSize > 0 && Number.isFinite(r.positionSize));
        assert.ok(r.maxRiskAmount > 0);
        // Risk on the position must equal the intended dollar risk.
        const realisedRisk = r.positionSize * Math.abs(2650 - (2650 * (1 - stopPct / 100)));
        assert.ok(Math.abs(realisedRisk - 50_000 * (risk / 100)) < 1.5, `risk mismatch at ${risk}% / ${stopPct}%`);
      }
    }
  });
});

/* ── Trade setup geometry ────────────────────────────────────── */

describe("Setup geometry", () => {
  const run = async (symbol: string, style: "scalping" | "day" | "swing" | "longterm") => {
    const bundle = await new DemoMarketDataProvider().getBundle(symbol);
    return analyzeBundle({ symbol, bundle, style, generatedAt: 1_700_000_000_000 });
  };

  it("produces internally consistent levels on every instrument", async () => {
    const symbols = ["BTC/USD", "ETH/USD", "EUR/USD", "XAU/USD", "AAPL", "NASDAQ", "S&P 500", "USD/JPY"];
    for (const symbol of symbols) {
      const analysis = await run(symbol, "day");
      for (const s of analysis.setups) {
        const isLong = s.direction === "long";
        // Entry zone must be ordered and on the correct side of the stop.
        assert.ok(s.entryLow <= s.entryHigh, `${symbol}: entry zone inverted`);
        assert.ok(s.stop > 0 && s.takeProfit > 0, `${symbol}: non-positive level`);
        assert.ok(isLong ? s.stop < s.entryLow : s.stop > s.entryHigh, `${symbol}: stop on wrong side`);
        assert.ok(
          isLong ? s.takeProfit > s.entryHigh : s.takeProfit < s.entryLow,
          `${symbol}: target on wrong side`,
        );
        assert.ok(s.riskReward >= 1, `${symbol}: reward/risk below 1`);
        assert.ok(s.confidence >= 0 && s.confidence <= 100, `${symbol}: confidence out of range`);
        assert.ok(s.invalidatedIf.length > 0, `${symbol}: missing invalidation`);
        assert.ok(s.rationale.length >= 3, `${symbol}: missing reasoning`);
        // Entry must be reachable — within a sane distance of the market.
        const distPct = Math.abs((s.entryLow + s.entryHigh) / 2 - s.referencePrice) / s.referencePrice;
        assert.ok(distPct < 0.12, `${symbol}: entry zone ${(distPct * 100).toFixed(1)}% away from price`);
      }
    }
  });

  it("computes reward/risk from the actual levels, not a constant", async () => {
    const analysis = await run("BTC/USD", "swing");
    for (const s of analysis.setups) {
      const entry = (s.entryLow + s.entryHigh) / 2;
      const expected = Math.abs(s.takeProfit - entry) / Math.abs(entry - s.stop);
      assert.ok(Math.abs(expected - s.riskReward) < 0.05, "reward/risk does not match the levels");
    }
  });

  it("never claims high quality for a setup generated inside a range", async () => {
    const symbols = ["BTC/USD", "ETH/USD", "EUR/USD", "AAPL", "DAX", "NASDAQ", "XAU/USD"];
    for (const symbol of symbols) {
      const analysis = await run(symbol, "day");
      for (const s of analysis.setups) {
        // Quality is capped by the regime of the setup's OWN timeframe, not the
        // anchor — a ranging 1H must not veto a legitimate 4H trend setup.
        if (s.regime === "ranging" || s.regime === "high-volatility") {
          assert.notEqual(s.quality, "high", `${symbol} ${s.timeframe}: high quality claimed in ${s.regime}`);
        }
      }
    }
  });

  it("reports the regime each setup was generated in", async () => {
    const analysis = await run("BTC/USD", "swing");
    for (const s of analysis.setups) {
      assert.ok(s.regime.length > 0);
      assert.ok(s.regimeLabel.length > 0);
    }
  });

  it("declines to invent setups when bias and timeframe conflict", () => {
    // Flat, directionless candles: no timeframe should agree on direction.
    const flat = makeCandles(120, 100, 0, 0.05);
    const readings = ["1h", "4h", "1d"].map((tf) => analyzeTimeframe(flat, tf as never).reading);
    const sets = detectSetups({
      symbol: "BTC/USD",
      candles: flat,
      timeframe: "1h",
      style: "day",
      overview: {
        price: flat[flat.length - 1].c,
        trend: "neutral",
        trendStrength: 5,
        structure: "range",
        structureNotes: "Rotational.",
        momentum: "flat",
        volatility: { atrPct: 0.05, label: "low" },
        volume: { ratio: 1, label: "normal" },
        regime: "ranging",
        regimeLabel: "Range-bound",
        supports: [],
        resistances: [],
        indicators: {
          ema20: 100,
          ema50: 100,
          ema200: 100,
          sma20: 100,
          rsi14: 50,
          macd: { macd: 0, signal: 0, histogram: 0 },
          atr14: 0.05,
          atrPct: 0.05,
          bb: { upper: 100.1, mid: 100, lower: 99.9, widthPct: 0.2 },
          stoch: { k: 50, d: 50 },
          obvSlope: 0,
          volumeRatio: 1,
          adx: 8,
        },
        keyLevelNote: "",
      },
      readings,
      overallBias: "neutral",
      demo: true,
      now: 1_700_000_000_000,
    });
    // Either no setup, or one explicitly marked low quality — never a strong call.
    for (const s of sets) {
      assert.notEqual(s.quality, "high");
    }
  });
});

/* ── Indicators ──────────────────────────────────────────────── */

describe("Indicators", () => {
  it("EMA converges to the input on a flat series", () => {
    const values = new Array(50).fill(100);
    const out = ema(values, 20);
    assert.ok(Math.abs(out[out.length - 1] - 100) < 1e-9);
  });

  it("RSI is 100 on a monotonically rising series and 0 on a falling one", () => {
    const up = Array.from({ length: 60 }, (_, i) => 100 + i);
    const down = Array.from({ length: 60 }, (_, i) => 200 - i);
    assert.ok(rsi(up, 14).at(-1)! > 99);
    assert.ok(rsi(down, 14).at(-1)! < 1);
  });

  it("ATR is positive and scales with range", () => {
    const calm = makeCandles(60, 100, 0, 0.05);
    const wild = makeCandles(60, 100, 0, 3);
    const calmAtr = atr(calm, 14).at(-1)!;
    const wildAtr = atr(wild, 14).at(-1)!;
    assert.ok(calmAtr > 0);
    assert.ok(wildAtr > calmAtr, "wider ranges must produce a larger ATR");
  });

  it("finds levels and classifies them relative to price", () => {
    const candles = makeCandles(200, 100, 0.05, 2);
    const price = candles.at(-1)!.c;
    const levels = findLevels(candles, price, 0.5);
    for (const l of levels) {
      assert.ok(l.strength > 0 && l.strength <= 1);
      if (l.price <= price) assert.equal(l.kind, "support");
      else assert.equal(l.kind, "resistance");
    }
  });
});

/* ── Multi-timeframe aggregation ─────────────────────────────── */

describe("Multi-timeframe bias", () => {
  it("weights higher timeframes more heavily", () => {
    const readings = [
      { timeframe: "1m" as const, bias: "bullish" as const, score: 60, momentum: 0, trendStrength: 50, volatilityPct: 0.3, notes: [] },
      { timeframe: "1w" as const, bias: "bearish" as const, score: -60, momentum: 0, trendStrength: 50, volatilityPct: 2, notes: [] },
    ];
    const result = aggregateBias(readings);
    assert.ok(result.score < 0, "weekly bearish should outweigh 1m bullish");
  });

  it("calls a conflicted book neutral", () => {
    const readings = [
      { timeframe: "1d" as const, bias: "bullish" as const, score: 4, momentum: 0, trendStrength: 20, volatilityPct: 1, notes: [] },
      { timeframe: "4h" as const, bias: "bearish" as const, score: -4, momentum: 0, trendStrength: 20, volatilityPct: 1, notes: [] },
    ];
    const result = aggregateBias(readings);
    assert.equal(result.bias, "neutral");
  });
});

/* ── Portfolio ───────────────────────────────────────────────── */

describe("Portfolio Engine", () => {
  it("computes realised P&L, win rate and profit factor", () => {
    const positions = [
      makePosition({ closedAt: 1, pnl: 200, pnlPct: 2 }),
      makePosition({ closedAt: 2, pnl: -100, pnlPct: -1 }),
      makePosition({ closedAt: 3, pnl: 100, pnlPct: 1 }),
    ];
    const summary = buildPortfolio({
      startingEquity: 10_000,
      currency: "USD",
      positions,
      journal: [],
      openPositions: [],
      priceOf: () => 100,
    });
    assert.equal(summary.realizedPnl, 200);
    assert.equal(summary.totalEquity, 10_200);
    assert.equal(summary.trades, 3);
    assert.equal(summary.winRate, 66.7);
    // 300 gross win / 100 gross loss
    assert.equal(summary.profitFactor, 3);
  });

  it("computes max drawdown from the closed-trade path", () => {
    const positions = [
      makePosition({ closedAt: 1, pnl: 1_000 }),
      makePosition({ closedAt: 2, pnl: -2_000 }),
      makePosition({ closedAt: 3, pnl: 500 }),
    ];
    const s = buildPortfolio({
      startingEquity: 10_000,
      currency: "USD",
      positions,
      journal: [],
      openPositions: [],
      priceOf: () => 100,
    });
    // Peak 11,000 → trough 9,000 = 18.18%
    assert.ok(Math.abs(s.maxDrawdownPct - 18.18) < 0.05, `got ${s.maxDrawdownPct}`);
  });

  it("includes unrealised P&L in total equity but not in realised", () => {
    const s = buildPortfolio({
      startingEquity: 10_000,
      currency: "USD",
      positions: [makePosition({ closedAt: 1, pnl: 100 })],
      journal: [],
      openPositions: [{ unrealizedPnl: 250, riskAmount: 100 }],
      priceOf: () => 100,
    });
    assert.equal(s.totalEquity, 10_350);
    assert.equal(s.realizedPnl, 100);
    assert.equal(s.unrealizedPnl, 250);
  });

  it("closes a long and a short with the correct sign", () => {
    const long = closePosition(makePosition({ entry: 100, size: 2, direction: "long" }), 110);
    const short = closePosition(makePosition({ entry: 100, size: 2, direction: "short" }), 110);
    assert.equal(long.pnl, 20);
    assert.equal(short.pnl, -20);
  });

  it("computes R multiple and unrealised P&L for an open position", () => {
    const m = positionMetrics(makePosition({ entry: 100, stop: 90, size: 5, direction: "long" }), 120);
    assert.equal(m.unrealizedPnl, 100);
    assert.equal(m.rMultiple, 2);
    assert.equal(m.riskAmount, 50);
  });

  it("returns an empty, non-throwing summary with no trades", () => {
    const s = buildPortfolio({
      startingEquity: 5_000,
      currency: "USD",
      positions: [],
      journal: [],
      openPositions: [],
      priceOf: () => 0,
    });
    assert.equal(s.trades, 0);
    assert.equal(s.totalEquity, 5_000);
    assert.equal(s.winRate, 0);
  });
});

/* ── Journal ─────────────────────────────────────────────────── */

describe("Journal Analyzer", () => {
  it("refuses to generalise from a tiny sample", () => {
    const insights = analyzeJournal([makeJournalEntry(), makeJournalEntry()]);
    assert.equal(insights.length, 1);
    assert.equal(insights[0].id, "insufficient");
  });

  it("flags losses larger than wins", () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      makeJournalEntry({
        pnl: i % 2 === 0 ? 20 : -60,
        rMultiple: i % 2 === 0 ? 1 : -3,
        result: i % 2 === 0 ? "win" : "loss",
      }),
    );
    const insights = analyzeJournal(entries);
    assert.ok(insights.some((i) => i.id === "loss-asymmetry"), "expected a loss-asymmetry insight");
    for (const ins of insights) assert.ok(ins.sampleSize > 0, "every insight must report its sample size");
  });

  it("detects style concentration of edge", () => {
    const entries: JournalEntry[] = [];
    for (let i = 0; i < 6; i++) {
      entries.push(makeJournalEntry({ strategy: "swing", pnl: 100, rMultiple: 2, direction: "long" }));
      entries.push(makeJournalEntry({ strategy: "scalping", pnl: -80, rMultiple: -1.5, direction: "long" }));
    }
    const insights = analyzeJournal(entries);
    assert.ok(insights.some((i) => i.id === "style-edge"));
  });

  it("produces a scorecard with neutral values for an empty journal", () => {
    const card = journalScorecard([]);
    assert.equal(card.length, 4);
    assert.ok(card.every((c) => c.value !== undefined));
  });
});

/* ── Chat grounding ──────────────────────────────────────────── */

describe("Copilot grounding", () => {
  it("resolves common instrument aliases", () => {
    assert.equal(resolveSymbol("how is bitcoin doing"), "BTC/USD");
    assert.equal(resolveSymbol("why is gold moving"), "XAU/USD");
    assert.equal(resolveSymbol("eurusd outlook"), "EUR/USD");
    assert.equal(resolveSymbol("is apple cheap"), "AAPL");
    assert.equal(resolveSymbol("nasdaq today"), "NASDAQ");
    assert.equal(resolveSymbol("something unrelated"), null);
  });

  it("routes intents correctly", () => {
    assert.equal(detectIntent("analyze BTC"), "analyze");
    assert.equal(detectIntent("find potential opportunities"), "opportunities");
    assert.equal(detectIntent("compare BTC and ETH"), "compare");
    assert.equal(detectIntent("calculate my position size"), "position-size");
    assert.equal(detectIntent("review my last 20 trades"), "journal-review");
    assert.equal(detectIntent("what is the funding rate"), "data-unavailable");
  });

  it("explicitly declines when data is unavailable instead of inventing it", () => {
    const ctx: ChatContext = {
      analyses: new Map(),
      portfolio: null,
      journal: [],
      journalInsights: [],
      riskDefaults: { balance: 10000, riskPct: 1 },
      watchlist: [],
      plan: "free",
    };
    const reply = buildReply("what is the news sentiment on BTC?", ctx);
    assert.match(reply.content, /don't have that data/i);
    assert.ok(reply.sources?.includes("Capability boundary"));
  });

  it("does not invent an analysis for an uncached instrument", () => {
    const ctx: ChatContext = {
      analyses: new Map(),
      portfolio: null,
      journal: [],
      journalInsights: [],
      riskDefaults: { balance: 10000, riskPct: 1 },
      watchlist: [],
      plan: "free",
    };
    const reply = buildReply("analyze ETH", ctx);
    assert.match(reply.content, /don't have a current analysis/i);
  });

  it("answers from real analysis data when present", async () => {
    const bundle = await new DemoMarketDataProvider().getBundle("BTC/USD");
    const analysis = analyzeBundle({ symbol: "BTC/USD", bundle, style: "day" });
    const ctx: ChatContext = {
      analyses: new Map([["BTC/USD", analysis]]),
      portfolio: null,
      journal: [],
      journalInsights: [],
      riskDefaults: { balance: 10000, riskPct: 1 },
      watchlist: ["BTC/USD"],
      plan: "pro",
    };
    const reply = buildReply("analyze BTC", ctx);
    assert.match(reply.content, /BTC\/USD/);
    assert.ok(!/guaranteed|100% accurate|risk-free/i.test(reply.content), "must never promise outcomes");
  });

  it("never uses prohibited certainty language", async () => {
    const bundle = await new DemoMarketDataProvider().getBundle("BTC/USD");
    const analysis = analyzeBundle({ symbol: "BTC/USD", bundle, style: "day" });
    const ctx: ChatContext = {
      analyses: new Map([["BTC/USD", analysis]]),
      portfolio: null,
      journal: [],
      journalInsights: [],
      riskDefaults: { balance: 10000, riskPct: 1 },
      watchlist: [],
      plan: "pro",
    };
    for (const q of ["analyze BTC", "find opportunities", "explain this setup", "what should I do"]) {
      const reply = buildReply(q, ctx);
      assert.ok(
        !/guaranteed profit|100% accurate|risk-free|sure thing/i.test(reply.content),
        `prohibited language in answer to "${q}"`,
      );
    }
  });
});

/* ── Market data integrity ───────────────────────────────────── */

describe("Market data layer", () => {
  it("labels demo data as demo everywhere", async () => {
    const p = new DemoMarketDataProvider();
    assert.equal(p.source, "demo");
    const bundle = await p.getBundle("BTC/USD");
    assert.equal(bundle.source, "demo");
    assert.equal(bundle.series["1h"].length > 100, true);
  });

  it("produces identical series for identical calls (deterministic)", async () => {
    const a = await new DemoMarketDataProvider().getBundle("ETH/USD");
    const b = await new DemoMarketDataProvider().getBundle("ETH/USD");
    assert.deepEqual(a.series["1h"], b.series["1h"]);
  });

  it("keeps candles internally consistent (h >= max(o,c), l <= min(o,c))", async () => {
    const bundle = await new DemoMarketDataProvider().getBundle("XAU/USD");
    for (const tf of Object.keys(bundle.series) as (keyof typeof bundle.series)[]) {
      for (const c of bundle.series[tf]) {
        assert.ok(c.h >= Math.max(c.o, c.c), `${tf}: high below body`);
        assert.ok(c.l <= Math.min(c.o, c.c), `${tf}: low above body`);
        assert.ok(c.v >= 0, `${tf}: negative volume`);
      }
    }
  });

  it("analysis carries its data source and a timestamp", async () => {
    const bundle = await new DemoMarketDataProvider().getBundle("S&P 500");
    const a = analyzeBundle({ symbol: "S&P 500", bundle, style: "swing" });
    assert.equal(a.source, "demo");
    assert.ok(a.asOf > 0);
    assert.match(a.dataDisclaimer, /DEMO DATA/);
  });
});

/**
 * Contract test for the public demo endpoint's payload.
 *
 * A client component rendering `setup.rationale` as `string[]` crashed the
 * landing page with React error #31 (objects are not valid as a child). These
 * assertions pin the shapes the UI is allowed to rely on, so a drift between
 * the engine and a component fails here instead of in the browser.
 */
describe("Demo analysis payload contract", () => {
  it("rationale entries are structured, never bare strings", async () => {
    const bundle = await new DemoMarketDataProvider().getBundle("BTC/USD");
    const analysis = analyzeBundle({ symbol: "BTC/USD", bundle, style: "swing" });
    assert.ok(analysis.setups.length > 0, "expected at least one setup");

    for (const setup of analysis.setups) {
      for (const reason of setup.rationale) {
        assert.equal(typeof reason, "object", "reason must be an object");
        assert.equal(typeof reason.label, "string");
        assert.equal(typeof reason.detail, "string");
        assert.ok(reason.label.length > 0);
        assert.ok(reason.detail.length > 0);
      }
    }
  });

  it("invalidatedIf is a flat array of strings, safe to render directly", async () => {
    const bundle = await new DemoMarketDataProvider().getBundle("XAU/USD");
    const analysis = analyzeBundle({ symbol: "XAU/USD", bundle, style: "swing" });
    for (const setup of analysis.setups) {
      for (const condition of setup.invalidatedIf) {
        assert.equal(typeof condition, "string");
        assert.ok(condition.length > 0);
      }
    }
  });
});
