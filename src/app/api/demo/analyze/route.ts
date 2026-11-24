import { z } from "zod";
import { analyzeBundle } from "@/lib/ai/analyze";
import { getMarketDataProvider, describeMarketData } from "@/lib/market-data";
import { INSTRUMENTS } from "@/lib/instruments";
import { rateLimit, fail, json, mapError } from "@/lib/api-helpers";
import type { TradingStyle } from "@/lib/types";

/**
 * Public, unauthenticated demo analysis for the landing page.
 *
 * The marketing page should not lie: this runs the same engine the product
 * runs, on the same demo feed, so what a visitor sees is exactly what they get
 * after signing in. It exposes no user data and is rate limited per IP, so it
 * cannot be used to enumerate the catalogue cheaply.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  symbol: z.string().min(1).max(24),
  style: z.enum(["scalping", "day", "swing", "longterm"]).default("swing"),
});

/** Instruments offered on the landing page, in display order. */
const FEATURED = ["BTC/USD", "ETH/USD", "XAU/USD", "EUR/USD", "AAPL", "NASDAQ", "S&P 500"];

export async function GET() {
  return json({
    instruments: INSTRUMENTS.filter((i) => FEATURED.includes(i.symbol)).map((i) => ({
      symbol: i.symbol,
      name: i.name,
      assetClass: i.assetClass,
    })),
    data: describeMarketData(),
  });
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`demo-analyze:${ip}`, 30, 60_000)) {
      return fail("Too many demo runs. Wait a minute.", 429, "RATE_LIMITED");
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail("Pick an instrument.", 422, "VALIDATION");

    const symbol = INSTRUMENTS.find((i) => i.symbol === parsed.data.symbol)?.symbol;
    if (!symbol) return fail("Unknown instrument.", 404, "NOT_FOUND");

    const provider = getMarketDataProvider();
    const bundle = await provider.getBundle(symbol);
    const analysis = analyzeBundle({
      symbol,
      bundle,
      style: parsed.data.style as TradingStyle,
    });

    const setup = analysis.setups[0] ?? null;

    return json({
      symbol,
      source: bundle.source,
      generatedAt: analysis.asOf,
      timeframe: analysis.timeframe,
      overallBias: analysis.overallBias,
      biasScore: analysis.overallScore,
      regime: analysis.overview.regime,
      regimeLabel: analysis.overview.regimeLabel,
      price: analysis.overview.price,
      summary: analysis.biasExplanation,
      structureNotes: analysis.overview.structureNotes,
      keyLevelNote: analysis.overview.keyLevelNote,
      timeframes: analysis.timeframes.map((tf) => ({
        timeframe: tf.timeframe,
        bias: tf.bias,
        score: tf.score,
      })),
      setup: setup
        ? {
            direction: setup.direction,
            timeframe: setup.timeframe,
            quality: setup.quality,
            entryLow: setup.entryLow,
            entryHigh: setup.entryHigh,
            stop: setup.stop,
            takeProfit: setup.takeProfit,
            riskReward: setup.riskReward,
            confidence: setup.confidence,
            rationale: setup.rationale,
            invalidatedIf: setup.invalidatedIf,
          }
        : null,
      setupsFound: analysis.setups.length,
    });
  } catch (err) {
    return mapError(err);
  }
}
