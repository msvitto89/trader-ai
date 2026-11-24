import type { AssetClass, Instrument } from "./types";

/**
 * Instrument catalogue. This is reference data (identifiers, tick sizes),
 * never prices — all prices come from the market-data layer.
 */
export const INSTRUMENTS: Instrument[] = [
  {
    symbol: "BTC/USD",
    name: "Bitcoin",
    assetClass: "crypto",
    quote: "USD",
    precision: 2,
    pipSize: 1,
    unitLabel: "BTC",
    blurb: "The liquidity bellwether for digital assets.",
  },
  {
    symbol: "ETH/USD",
    name: "Ethereum",
    assetClass: "crypto",
    quote: "USD",
    precision: 2,
    pipSize: 0.1,
    unitLabel: "ETH",
    blurb: "High-beta crypto risk with deep liquidity.",
  },
  {
    symbol: "SOL/USD",
    name: "Solana",
    assetClass: "crypto",
    quote: "USD",
    precision: 2,
    pipSize: 0.01,
    unitLabel: "SOL",
    blurb: "Higher-volatility altcoin benchmark.",
  },
  {
    symbol: "EUR/USD",
    name: "Euro / US Dollar",
    assetClass: "forex",
    quote: "USD",
    precision: 5,
    pipSize: 0.0001,
    unitLabel: "EUR",
    blurb: "The world's most traded currency pair.",
  },
  {
    symbol: "GBP/USD",
    name: "British Pound / US Dollar",
    assetClass: "forex",
    quote: "USD",
    precision: 5,
    pipSize: 0.0001,
    unitLabel: "GBP",
    blurb: "Sterling: wider ranges, event-sensitive.",
  },
  {
    symbol: "USD/JPY",
    name: "US Dollar / Japanese Yen",
    assetClass: "forex",
    quote: "JPY",
    precision: 3,
    pipSize: 0.01,
    unitLabel: "USD",
    blurb: "A global risk-sentiment and rates proxy.",
  },
  {
    symbol: "XAU/USD",
    name: "Gold Spot",
    assetClass: "commodities",
    quote: "USD",
    precision: 2,
    pipSize: 0.1,
    unitLabel: "oz",
    blurb: "Real-rate and safe-haven barometer.",
  },
  {
    symbol: "WTI/USD",
    name: "Crude Oil (WTI)",
    assetClass: "commodities",
    quote: "USD",
    precision: 2,
    pipSize: 0.01,
    unitLabel: "bbl",
    blurb: "Supply-shock sensitive energy benchmark.",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    assetClass: "stocks",
    quote: "USD",
    precision: 2,
    pipSize: 0.01,
    unitLabel: "shares",
    blurb: "Mega-cap tech with heavy options flow.",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    assetClass: "stocks",
    quote: "USD",
    precision: 2,
    pipSize: 0.01,
    unitLabel: "shares",
    blurb: "The market's AI-capex proxy.",
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    assetClass: "stocks",
    quote: "USD",
    precision: 2,
    pipSize: 0.01,
    unitLabel: "shares",
    blurb: "High-dispersion single-name risk.",
  },
  {
    symbol: "NASDAQ",
    name: "Nasdaq 100 Index",
    assetClass: "indices",
    quote: "USD",
    precision: 2,
    pipSize: 0.25,
    unitLabel: "index units",
    blurb: "Growth-duration equity benchmark.",
  },
  {
    symbol: "S&P 500",
    name: "S&P 500 Index",
    assetClass: "indices",
    quote: "USD",
    precision: 2,
    pipSize: 0.25,
    unitLabel: "index units",
    blurb: "The broad US equity risk gauge.",
  },
  {
    symbol: "DAX",
    name: "DAX 40 Index",
    assetClass: "indices",
    quote: "EUR",
    precision: 2,
    pipSize: 1,
    unitLabel: "index units",
    blurb: "European industrial-cycle exposure.",
  },
];

const bySymbol = new Map(INSTRUMENTS.map((i) => [i.symbol, i]));

export function getInstrument(symbol: string): Instrument | undefined {
  return bySymbol.get(symbol);
}

export function requireInstrument(symbol: string): Instrument {
  const found = bySymbol.get(symbol);
  if (!found) throw new Error(`Unknown instrument: ${symbol}`);
  return found;
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  crypto: "Crypto",
  forex: "Forex",
  stocks: "Stocks",
  indices: "Indices",
  commodities: "Commodities",
};

export const ASSET_CLASSES: AssetClass[] = [
  "crypto",
  "forex",
  "stocks",
  "indices",
  "commodities",
];

export function assetClassOf(symbol: string): AssetClass {
  return getInstrument(symbol)?.assetClass ?? "crypto";
}

/** Assets held on a continuous 24/7 session. */
export function isAlwaysOn(assetClass: AssetClass): boolean {
  return assetClass === "crypto";
}
