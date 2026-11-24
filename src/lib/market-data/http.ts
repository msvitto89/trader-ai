/**
 * Generic REST market-data adapter.
 *
 * The product is provider-agnostic: this adapter maps any REST endpoint that
 * returns an array of OHLCV objects onto the internal Candle shape. Point it
 * at a vendor (Twelve Data, Polygon, Binance, OANDA bridge, internal service)
 * by setting MARKET_DATA_BASE_URL and adjusting `requestFor` in one place.
 *
 * Contract expected from the upstream endpoint:
 *   GET {BASE_URL}/ohlcv?symbol=BTC/USD&interval=4h&limit=300
 *   Authorization: Bearer {MARKET_DATA_API_KEY}
 *   → { "candles": [{ "t": 1730000000000, "o": 1, "h": 2, "l": 0.5, "c": 1.8, "v": 1200 }] }
 *
 * Credentials are read server-side only; this module must never be imported
 * into client components.
 */

import { requireInstrument } from "../instruments";
import type { Candle, Quote, SeriesBundle, Timeframe } from "../types";
import { TIMEFRAMES } from "../types";
import { MarketDataError, type MarketDataProvider } from "./types";

interface RawCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Map internal timeframes onto the upstream interval vocabulary. */
function upstreamInterval(tf: Timeframe): string {
  return tf;
}

function isRawCandle(value: unknown): value is RawCandle {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["t", "o", "h", "l", "c", "v"].every((k) => typeof v[k] === "number");
}

export class HttpMarketDataProvider implements MarketDataProvider {
  readonly id = "http";
  readonly source = "live" as const;
  readonly label = "Custom REST Feed";
  private baseUrl?: string;
  private apiKey?: string;
  private cache = new Map<string, { at: number; value: SeriesBundle }>();
  private static TTL = 30_000;

  constructor(baseUrl = process.env.MARKET_DATA_BASE_URL, apiKey = process.env.MARKET_DATA_API_KEY) {
    this.baseUrl = baseUrl?.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
  }

  private async fetchJson(path: string, params: Record<string, string>): Promise<unknown> {
    if (!this.baseUrl) throw new MarketDataError("MARKET_DATA_BASE_URL is not set", "NOT_CONFIGURED");
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new MarketDataError(`Upstream responded ${res.status}`, `UPSTREAM_${res.status}`);
    }
    return res.json();
  }

  async getSeries(symbol: string, timeframe: Timeframe, limit = 300): Promise<Candle[]> {
    const payload = (await this.fetchJson("/ohlcv", {
      symbol,
      interval: upstreamInterval(timeframe),
      limit: String(limit),
    })) as { candles?: unknown };
    const rows = Array.isArray(payload?.candles) ? payload.candles : [];
    const candles = rows.filter(isRawCandle).map((c) => ({
      t: c.t,
      o: c.o,
      h: c.h,
      l: c.l,
      c: c.c,
      v: c.v,
    }));
    if (candles.length < 30) {
      throw new MarketDataError(
        `Insufficient history for ${symbol} ${timeframe} (${candles.length} bars)`,
        "INSUFFICIENT_HISTORY",
      );
    }
    return candles.sort((a, b) => a.t - b.t);
  }

  async getBundle(symbol: string): Promise<SeriesBundle> {
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.at < HttpMarketDataProvider.TTL) return cached.value;

    const entries = await Promise.all(
      TIMEFRAMES.map(async (tf) => [tf, await this.getSeries(symbol, tf)] as const),
    );
    const series = Object.fromEntries(entries) as Record<Timeframe, Candle[]>;
    const value: SeriesBundle = {
      symbol,
      source: "live",
      provider: this.label,
      series,
      asOf: Date.now(),
    };
    this.cache.set(symbol, { at: Date.now(), value });
    return value;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const payload = (await this.fetchJson("/quote", { symbol })) as Record<string, unknown>;
    const num = (k: string) => (typeof payload[k] === "number" ? (payload[k] as number) : 0);
    const price = num("price");
    if (!price) throw new MarketDataError(`Malformed quote for ${symbol}`, "BAD_QUOTE");
    return {
      symbol,
      price,
      change: num("change"),
      changePct: num("changePct"),
      dayHigh: num("dayHigh") || price,
      dayLow: num("dayLow") || price,
      volume: num("volume"),
      spread: num("spread") || requireInstrument(symbol).pipSize * 1.5,
      timestamp: typeof payload.timestamp === "number" ? (payload.timestamp as number) : Date.now(),
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const payload = (await this.fetchJson("/quotes", { symbols: symbols.join(",") })) as {
      quotes?: Record<string, unknown>[];
    };
    const rows = Array.isArray(payload?.quotes) ? payload.quotes : [];
    const out: Quote[] = [];
    for (const row of rows) {
      const symbol = typeof row.symbol === "string" ? row.symbol : null;
      if (!symbol || typeof row.price !== "number") continue;
      out.push({
        symbol,
        price: row.price,
        change: typeof row.change === "number" ? row.change : 0,
        changePct: typeof row.changePct === "number" ? row.changePct : 0,
        dayHigh: typeof row.dayHigh === "number" ? row.dayHigh : row.price,
        dayLow: typeof row.dayLow === "number" ? row.dayLow : row.price,
        volume: typeof row.volume === "number" ? row.volume : 0,
        spread: typeof row.spread === "number" ? row.spread : 0,
        timestamp: typeof row.timestamp === "number" ? row.timestamp : Date.now(),
      });
    }
    if (out.length !== symbols.length) {
      // Fall back to per-symbol quotes for anything missing.
      const missing = symbols.filter((s) => !out.some((q) => q.symbol === s));
      const filled = await Promise.all(missing.map((s) => this.getQuote(s)));
      out.push(...filled);
    }
    return out;
  }
}
