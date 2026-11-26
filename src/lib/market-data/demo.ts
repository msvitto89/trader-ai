/**
 * Deterministic DEMO market data.
 *
 * Purpose: let the product run end-to-end without provider credentials while
 * remaining honest — every consumer is told `source: "demo"`, and the UI shows
 * a "DEMO DATA" badge. Prices are generated as a seeded stochastic process
 * anchored to a plausible base price per instrument, with trend regimes,
 * volatility clustering and volume that tracks range. The same minute always
 * produces the same series, so server and client agree.
 */

import { requireInstrument } from "../instruments";
import type { Candle, Quote, SeriesBundle } from "../types";
import { TIMEFRAMES, TIMEFRAME_MS, type Timeframe } from "../types";
import type { MarketDataProvider } from "./types";

/** Plausible anchor levels — reference only, not a quote feed. */
const ANCHORS: Record<string, number> = {
  "BTC/USD": 68250,
  "ETH/USD": 3320,
  "SOL/USD": 168.4,
  "EUR/USD": 1.0842,
  "GBP/USD": 1.2718,
  "USD/JPY": 154.32,
  "XAU/USD": 2648.5,
  "WTI/USD": 79.4,
  AAPL: 231.6,
  NVDA: 128.4,
  TSLA: 248.9,
  NASDAQ: 20512.4,
  "S&P 500": 5842.1,
  DAX: 19412.8,
};

/** Per-bar volatility in percent, calibrated per asset class. */
const VOL: Record<string, number> = {
  "BTC/USD": 0.62,
  "ETH/USD": 0.82,
  "SOL/USD": 1.25,
  "EUR/USD": 0.075,
  "GBP/USD": 0.095,
  "USD/JPY": 0.085,
  "XAU/USD": 0.22,
  "WTI/USD": 0.45,
  AAPL: 0.28,
  NVDA: 0.46,
  TSLA: 0.55,
  NASDAQ: 0.2,
  "S&P 500": 0.16,
  DAX: 0.22,
};

const BARS_PER_TF: Record<Timeframe, number> = {
  "1m": 420,
  "5m": 420,
  "15m": 420,
  "1h": 480,
  "4h": 420,
  "1d": 420,
  "1w": 260,
};

/** Volatility scaling of a timeframe relative to the 1h baseline. */
const TF_VOL_SCALE: Record<Timeframe, number> = {
  "1m": Math.sqrt(1 / 60),
  "5m": Math.sqrt(5 / 60),
  "15m": Math.sqrt(15 / 60),
  "1h": 1,
  "4h": Math.sqrt(4) * 0.95,
  "1d": Math.sqrt(24) * 0.7,
  "1w": Math.sqrt(24 * 7) * 0.52,
};

function hashString(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — small, fast, deterministic. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 5-minute bucket: prices refresh at production-like cadence. */
function bucketNow(): number {
  const bucket = 5 * 60_000;
  return Math.floor(Date.now() / bucket) * bucket;
}

interface RegimePlan {
  drift: number; // per-bar drift in percent
  volMult: number;
  segments: { until: number; drift: number; vol: number }[];
}

/**
 * Build a piecewise regime so demo charts show trend → pullback → trend,
 * rather than a shapeless noise walk.
 */
function planRegimes(symbol: string, timeframe: Timeframe, bars: number): RegimePlan {
  const seed = hashString(`regime:${symbol}:${timeframe}:${Math.floor(bucketNow() / (3600_000 * 6))}`);
  const rand = mulberry32(seed);
  const personality = mulberry32(hashString(`personality:${symbol}`))();
  // Direction bias: some instruments structurally drift up, others down.
  const directional = personality > 0.72 ? 1 : personality < 0.3 ? -1 : (rand() > 0.5 ? 1 : -1) * 0.6;
  const baseDrift = directional * (0.012 + rand() * 0.03);
  const volMult = 0.75 + rand() * 0.6;

  const segments: RegimePlan["segments"] = [];
  let cursor = 0;
  while (cursor < bars) {
    const len = Math.floor(bars * (0.12 + rand() * 0.22)) + 8;
    const pullback = rand() > 0.45 ? -Math.sign(baseDrift) : Math.sign(baseDrift);
    const drift = cursor === 0 ? baseDrift * 0.6 : baseDrift * (0.4 + rand() * 1.1) * pullback;
    const vol = volMult * (0.7 + rand() * 0.75);
    cursor += len;
    segments.push({ until: Math.min(cursor, bars), drift, vol });
  }
  return { drift: baseDrift, volMult, segments };
}

function generateCandles(symbol: string, timeframe: Timeframe, bars: number, endPrice: number, now: number): Candle[] {
  const step = TIMEFRAME_MS[timeframe];
  const volPct = (VOL[symbol] ?? 0.4) * TF_VOL_SCALE[timeframe];
  const plan = planRegimes(symbol, timeframe, bars);
  const rand = mulberry32(hashString(`${symbol}:${timeframe}:${Math.floor(now / (5 * 60_000))}`));

  // Walk backwards from a synthetic start, then rescale to the anchor.
  const raw: Candle[] = [];
  let price = endPrice;
  let segIdx = plan.segments.length - 1;
  let volState = 1;

  for (let i = bars - 1; i >= 0; i--) {
    while (segIdx > 0 && i < (plan.segments[segIdx - 1]?.until ?? 0)) segIdx--;
    const seg = plan.segments[Math.min(segIdx, plan.segments.length - 1)];
    // Volatility clustering (GARCH-ish): today's range informs tomorrow's.
    volState = 0.86 * volState + 0.14 * (0.6 + rand() * 0.9);
    const stepVol = (volPct * seg.vol * volState) / 100;
    const drift = (seg.drift / 100) * TF_VOL_SCALE[timeframe] * 0.55;
    const ret = drift + stepVol * gaussian(rand);
    const open = price / (1 + ret);
    const close = price;
    const hi = Math.max(open, close) * (1 + Math.abs(gaussian(rand)) * stepVol * 0.35);
    const lo = Math.min(open, close) * (1 - Math.abs(gaussian(rand)) * stepVol * 0.35);
    const range = (hi - lo) / open;
    const baseVol = ANCHOR_VOLUME[symbol] ?? 1000;
    const volume =
      baseVol *
      TF_VOL_SCALE[timeframe] *
      (0.55 + rand() * 0.8) *
      (1 + range * 90) *
      (seg.drift !== 0 ? 1.08 : 1);
    raw.push({ t: now - i * step, o: open, h: hi, l: lo, c: close, v: volume });
    price = open;
  }

  // Rescale so the final close matches the anchor exactly.
  const scale = endPrice / raw[raw.length - 1].c;
  const precision = requireInstrument(symbol).precision;
  const round = (v: number) => Number(v.toFixed(precision + 2));
  return raw.map((c) => ({
    t: c.t,
    o: round(c.o * scale),
    h: round(c.h * scale),
    l: round(c.l * scale),
    c: round(c.c * scale),
    v: Math.round(c.v),
  }));
}

const ANCHOR_VOLUME: Record<string, number> = {
  "BTC/USD": 180,
  "ETH/USD": 2400,
  "SOL/USD": 28000,
  "EUR/USD": 120000,
  "GBP/USD": 68000,
  "USD/JPY": 74000,
  "XAU/USD": 24000,
  "WTI/USD": 31000,
  AAPL: 420000,
  NVDA: 980000,
  TSLA: 640000,
  NASDAQ: 210000,
  "S&P 500": 420000,
  DAX: 88000,
};

/** Current demo price: anchor plus a slow intraday drift so it moves over time. */
function currentPrice(symbol: string, now: number): number {
  const base = ANCHORS[symbol] ?? 100;
  const seed = hashString(`price:${symbol}`);
  const rand = mulberry32(seed);
  const dailyAmp = (0.004 + rand() * 0.012) * (VOL[symbol] ?? 0.3) / 0.3;
  const dayPhase = (now / 86_400_000) * Math.PI * 2;
  const hourPhase = (now / 3_600_000) * Math.PI * 2;
  const wobble =
    Math.sin(dayPhase + rand() * 6.28) * dailyAmp +
    Math.sin(hourPhase * 1.7 + rand() * 6.28) * dailyAmp * 0.28;
  const minuteSeed = mulberry32(hashString(`${symbol}:${Math.floor(now / 300_000)}`));
  const noise = (minuteSeed() - 0.5) * dailyAmp * 0.18;
  return base * (1 + wobble + noise);
}

const cache = new Map<string, { at: number; value: SeriesBundle }>();
const CACHE_TTL = 45_000;

function buildBundle(symbol: string): SeriesBundle {
  const now = bucketNow();
  const price = currentPrice(symbol, now);
  const series = {} as Record<Timeframe, Candle[]>;
  for (const tf of TIMEFRAMES) {
    series[tf] = generateCandles(symbol, tf, BARS_PER_TF[tf], price, now);
  }
  return {
    symbol,
    source: "demo",
    provider: "tradia-demo",
    series,
    asOf: now,
  };
}

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly id = "demo";
  readonly source = "demo" as const;
  readonly label = "TRADIA Demo Feed";

  isConfigured(): boolean {
    return true;
  }

  async getBundle(symbol: string): Promise<SeriesBundle> {
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
    const value = buildBundle(symbol);
    cache.set(symbol, { at: Date.now(), value });
    return value;
  }

  async getSeries(symbol: string, timeframe: Timeframe, limit = 300) {
    const bundle = await this.getBundle(symbol);
    return bundle.series[timeframe].slice(-limit);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const bundle = await this.getBundle(symbol);
    const daily = bundle.series["1d"];
    const last = daily[daily.length - 1];
    const prev = daily[daily.length - 2] ?? last;
    const intraday = bundle.series["15m"];
    const recent = intraday.slice(-96); // last 24h of 15m bars
    const dayHigh = Math.max(...recent.map((c) => c.h));
    const dayLow = Math.min(...recent.map((c) => c.l));
    const change = last.c - prev.c;
    return {
      symbol,
      price: last.c,
      change,
      changePct: prev.c ? (change / prev.c) * 100 : 0,
      dayHigh,
      dayLow,
      volume: recent.reduce((a, c) => a + c.v, 0),
      spread: requireInstrument(symbol).pipSize * 1.5,
      timestamp: bundle.asOf,
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return Promise.all(symbols.map((s) => this.getQuote(s)));
  }
}

/** Test/seed helper: deterministic series for a fixed timestamp. */
export function demoSeriesAt(symbol: string, timeframe: Timeframe, ts: number, bars = 300): Candle[] {
  const price = currentPrice(symbol, bucketNow());
  return generateCandles(symbol, timeframe, bars, price, ts).slice(-bars);
}
