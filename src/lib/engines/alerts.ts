/**
 * Notification Engine.
 *
 * Evaluates user alert rules against current market data and AI output, then
 * records matching events. Delivery channels (email/push) are intentionally
 * pluggable: this module produces the event, a transport would deliver it.
 */

import { getMarketDataProvider } from "../market-data";
import { analyzeBundle } from "../ai/analyze";
import type { AlertEvent, AlertRule, Bias, TradingStyle } from "../types";

export interface AlertEvaluation {
  rule: AlertRule;
  triggered: boolean;
  title: string;
  detail: string;
}

export async function evaluateAlerts(
  rules: AlertRule[],
  opts: { style: TradingStyle; knownBias?: Map<string, Bias> },
): Promise<AlertEvaluation[]> {
  const active = rules.filter((r) => r.active);
  if (!active.length) return [];

  const provider = getMarketDataProvider();
  const symbols = [...new Set(active.map((r) => r.symbol))];
  const out: AlertEvaluation[] = [];

  for (const symbol of symbols) {
    let quote;
    let analysis;
    try {
      quote = await provider.getQuote(symbol);
      const bundle = await provider.getBundle(symbol);
      analysis = analyzeBundle({ symbol, bundle, style: opts.style });
    } catch {
      continue;
    }

    for (const rule of active.filter((r) => r.symbol === symbol)) {
      let triggered = false;
      let title = "";
      let detail = "";

      switch (rule.kind) {
        case "price-above":
          if (rule.value != null && quote.price >= rule.value) {
            triggered = true;
            title = `${symbol} above ${rule.value}`;
            detail = `Price is ${quote.price.toFixed(4)} — your alert level was ${rule.value}.`;
          }
          break;
        case "price-below":
          if (rule.value != null && quote.price <= rule.value) {
            triggered = true;
            title = `${symbol} below ${rule.value}`;
            detail = `Price is ${quote.price.toFixed(4)} — your alert level was ${rule.value}.`;
          }
          break;
        case "breakout": {
          const res = analysis.overview.resistances[0]?.price;
          const sup = analysis.overview.supports[0]?.price;
          if (res && quote.price > res && analysis.overview.volume.ratio > 1.15) {
            triggered = true;
            title = `${symbol} breaking resistance`;
            detail = `Price cleared ${res.toFixed(4)} with volume at ${analysis.overview.volume.ratio.toFixed(2)}× average.`;
          } else if (sup && quote.price < sup && analysis.overview.volume.ratio > 1.15) {
            triggered = true;
            title = `${symbol} breaking support`;
            detail = `Price lost ${sup.toFixed(4)} with volume at ${analysis.overview.volume.ratio.toFixed(2)}× average.`;
          }
          break;
        }
        case "trend-change": {
          const previous = opts.knownBias?.get(symbol);
          const next = analysis.overallBias;
          if (previous && previous !== next) {
            triggered = true;
            title = `${symbol} bias shifted to ${next}`;
            detail = `The multi-timeframe read moved from ${previous} to ${next} (score ${analysis.overallScore}).`;
          }
          break;
        }
        case "ai-opportunity":
          if (analysis.setups.some((s) => s.quality === "high" || s.quality === "medium")) {
            const s = analysis.setups[0];
            triggered = true;
            title = `${symbol}: ${s.direction.toUpperCase()} setup detected`;
            detail = `${s.quality} confluence on the ${s.timeframe.toUpperCase()} — entry ${s.entryLow}–${s.entryHigh}, stop ${s.stop}, ${s.riskReward.toFixed(1)}:1.`;
          }
          break;
        case "risk": {
          const atrPct = analysis.overview.volatility.atrPct;
          if (rule.value != null && atrPct >= rule.value) {
            triggered = true;
            title = `${symbol} volatility above your threshold`;
            detail = `ATR is ${atrPct.toFixed(2)}% of price, at or above your ${rule.value}% threshold. Stops need widening and size needs cutting.`;
          }
          break;
        }
        case "economic-event":
          // Calendar-driven; handled by the briefing service, which knows the schedule.
          break;
      }

      if (triggered) out.push({ rule, triggered, title, detail });
    }
  }

  return out;
}

export function toAlertEvent(userId: string, evaluation: AlertEvaluation): Omit<AlertEvent, "id" | "createdAt" | "read"> {
  return {
    ruleId: evaluation.rule.id,
    symbol: evaluation.rule.symbol,
    kind: evaluation.rule.kind,
    title: evaluation.title,
    detail: evaluation.detail,
  };
}
