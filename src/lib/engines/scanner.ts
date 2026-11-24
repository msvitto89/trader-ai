/**
 * Scanner Engine.
 *
 * Evaluates a universe of instruments through the same analysis pipeline the
 * AI Analyst uses (no separate scoring path — consistency matters more than
 * variety), then ranks by confluence and fit with the trader's filters.
 */

import { INSTRUMENTS } from "../instruments";
import { getMarketDataProvider } from "../market-data";
import { analyzeBundle } from "../ai/analyze";
import { setupHeadline } from "../ai/opportunity";
import type {
  AIAnalysis,
  AssetClass,
  ScanFilters,
  ScannedAsset,
  TradingStyle,
} from "../types";

const STYLE_FIT: Record<TradingStyle, TradingStyle[]> = {
  scalping: ["scalping", "day"],
  day: ["day", "scalping"],
  swing: ["swing", "day"],
  longterm: ["longterm", "swing"],
};

const RISK_VOL_WINDOW: Record<string, [number, number]> = {
  conservative: [0, 1.6],
  moderate: [0.2, 3.2],
  aggressive: [0.4, 100],
};

export interface ScannerResult {
  rows: ScannedAsset[];
  scanned: number;
  source: "live" | "demo";
  provider: string;
  asOf: number;
  filters: ScanFilters;
  /** Analyses kept so the chat/copilot can reason over the same data. */
  analyses: AIAnalysis[];
}

export function universeFor(filters: Pick<ScanFilters, "assetClasses">) {
  const classes = filters.assetClasses.length ? filters.assetClasses : (["crypto", "forex", "stocks", "indices", "commodities"] as AssetClass[]);
  return INSTRUMENTS.filter((i) => classes.includes(i.assetClass));
}

export async function runScan(filters: ScanFilters): Promise<ScannerResult> {
  const provider = getMarketDataProvider();
  const universe = universeFor(filters);
  const analyses: AIAnalysis[] = [];

  // Bounded concurrency keeps the demo generator fast and a real provider polite.
  const batchSize = 4;
  for (let i = 0; i < universe.length; i += batchSize) {
    const batch = universe.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (inst) => {
        const bundle = await provider.getBundle(inst.symbol);
        return analyzeBundle({ symbol: inst.symbol, bundle, style: filters.style });
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") analyses.push(r.value);
    }
  }

  const [volLo, volHi] = RISK_VOL_WINDOW[filters.risk] ?? [0, 100];
  const styleFit = STYLE_FIT[filters.style] ?? [filters.style];

  const rows: ScannedAsset[] = analyses.map((a) => {
    const setup = a.setups[0] ?? null;
    const fitBonus = setup && styleFit.includes(setup.style) ? 6 : 0;
    const volPenalty = a.overview.volatility.atrPct > volHi ? 12 : a.overview.volatility.atrPct < volLo ? 6 : 0;
    const qualityBonus = setup ? (setup.quality === "high" ? 14 : setup.quality === "medium" ? 6 : 0) : -10;

    // Ranking score: directional conviction, minus regime/volatility friction.
    const rank =
      Math.abs(a.overallScore) * 0.55 +
      (setup ? Math.min(30, setup.confidence * 0.3) : 0) +
      fitBonus +
      qualityBonus -
      volPenalty;

    return {
      symbol: a.symbol,
      name: a.name,
      assetClass: a.assetClass,
      price: a.price,
      changePct: a.timeframes.length ? a.overview.indicators.atrPct : 0,
      source: a.source,
      bias: a.overallBias,
      score: Math.round(rank),
      regime: a.overview.regime,
      volatilityPct: a.overview.volatility.atrPct,
      setup,
      headline: setupHeadline(setup, a.overallBias, a.overview.regimeLabel.toLowerCase()),
    };
  });

  rows.sort((a, b) => b.score - a.score);

  const source = analyses[0]?.source ?? provider.source;
  return {
    rows: rows.slice(0, filters.limit),
    scanned: analyses.length,
    source,
    provider: analyses[0]?.provider ?? provider.label,
    asOf: Math.max(...analyses.map((a) => a.asOf), Date.now()),
    filters,
    analyses,
  };
}

export { INSTRUMENTS };
