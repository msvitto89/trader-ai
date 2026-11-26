import type { DataSource, Quote, SeriesBundle, Timeframe } from "../types";
import { TIMEFRAMES } from "../types";

/**
 * Market-data provider contract.
 *
 * Every provider returns a `SeriesBundle` per symbol. The `source` field is
 * mandatory and propagates all the way to the UI, so DEMO data can never be
 * presented as live. To add a provider, implement this interface and register
 * it in `provider.ts`.
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly source: DataSource;
  readonly label: string;
  /** True when credentials/connectivity are present. */
  isConfigured(): boolean;
  /** Historical candles for one timeframe, oldest first. */
  getSeries(symbol: string, timeframe: Timeframe, limit?: number): Promise<import("../types").Candle[]>;
  /** Bundled series for every timeframe the product analyses. */
  getBundle(symbol: string): Promise<SeriesBundle>;
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
}

export class MarketDataError extends Error {
  readonly code: string;
  constructor(message: string, code = "MARKET_DATA_ERROR") {
    super(message);
    this.name = "MarketDataError";
    this.code = code;
  }
}

export const REQUIRED_TIMEFRAMES = TIMEFRAMES;
