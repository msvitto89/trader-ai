/**
 * Risk Engine.
 *
 * Pure functions, no I/O. This is the layer that decides whether a trade is
 * even representable, so it validates aggressively and explains every
 * warning in language a trader can act on.
 */

import { requireInstrument } from "../instruments";
import { clamp, roundTo } from "../format";
import type { RiskInput, RiskResult } from "../types";

const MAX_RISK_PCT = 20;
const MAX_LEVERAGE = 100;

export function calculateRisk(input: RiskInput): RiskResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const inst = requireInstrument(input.symbol);
  const precision = inst.precision;

  const balance = Number(input.balance);
  const riskPct = Number(input.riskPct);
  const entry = Number(input.entry);
  const stop = Number(input.stop);
  const takeProfit = Number(input.takeProfit);
  const leverage = input.leverage && input.leverage > 0 ? Math.min(input.leverage, MAX_LEVERAGE) : null;

  if (!Number.isFinite(balance) || balance <= 0) errors.push("Account balance must be greater than 0.");
  if (!Number.isFinite(riskPct) || riskPct <= 0) errors.push("Risk % must be greater than 0.");
  if (riskPct > MAX_RISK_PCT) errors.push(`Risk per trade above ${MAX_RISK_PCT}% is blocked — that is not risk management.`);
  if (!Number.isFinite(entry) || entry <= 0) errors.push("Entry price is required.");
  if (!Number.isFinite(stop) || stop <= 0) errors.push("Stop loss is required — trades without a stop cannot be sized.");
  if (!Number.isFinite(takeProfit) || takeProfit <= 0) errors.push("Take profit is required to evaluate the trade.");

  if (errors.length) {
    return {
      valid: false,
      errors,
      symbol: input.symbol,
      direction: input.direction,
      maxRiskAmount: 0,
      stopDistance: 0,
      stopDistancePct: 0,
      takeProfitDistance: 0,
      positionSize: 0,
      notional: 0,
      marginRequired: null,
      potentialLoss: 0,
      potentialProfit: 0,
      riskReward: 0,
      breakEvenMove: 0,
      exposurePct: 0,
      warnings,
    };
  }

  const isLong = input.direction === "long";
  if (isLong && stop >= entry) errors.push("For a long, the stop must be below the entry.");
  if (!isLong && stop <= entry) errors.push("For a short, the stop must be above the entry.");
  if (isLong && takeProfit <= entry) errors.push("For a long, the take profit must be above the entry.");
  if (!isLong && takeProfit >= entry) errors.push("For a short, the take profit must be below the entry.");

  const stopDistance = Math.abs(entry - stop);
  const tpDistance = Math.abs(takeProfit - entry);
  if (stopDistance <= 0) errors.push("Stop distance is zero.");
  if (errors.length) {
    return {
      valid: false,
      errors,
      symbol: input.symbol,
      direction: input.direction,
      maxRiskAmount: 0,
      stopDistance: 0,
      stopDistancePct: 0,
      takeProfitDistance: 0,
      positionSize: 0,
      notional: 0,
      marginRequired: null,
      potentialLoss: 0,
      potentialProfit: 0,
      riskReward: 0,
      breakEvenMove: 0,
      exposurePct: 0,
      warnings,
    };
  }

  const maxRiskAmount = (balance * riskPct) / 100;
  const positionSize = maxRiskAmount / stopDistance;
  const notional = positionSize * entry;
  const marginRequired = leverage ? notional / leverage : null;
  const riskReward = tpDistance / stopDistance;

  const stopDistancePct = (stopDistance / entry) * 100;
  const exposurePct = balance > 0 ? (notional / balance) * 100 : 0;
  const breakEvenMove = (inst.pipSize * 1.5 / entry) * 100;

  if (marginRequired !== null && marginRequired > balance) {
    errors.push(
      `Required margin ${marginRequired.toFixed(2)} exceeds the account balance at ${leverage}:1 leverage. Reduce size or raise leverage.`,
    );
  }

  if (riskReward < 1) {
    warnings.push(`Reward-to-risk is ${riskReward.toFixed(2)}:1 — you need a very high win rate to profit with this profile.`);
  } else if (riskReward < 1.5) {
    warnings.push(`Reward-to-risk of ${riskReward.toFixed(2)}:1 is thin. Consider a tighter stop or a further target.`);
  }

  if (stopDistancePct < 0.15) {
    warnings.push("Stop is inside typical noise for this instrument — the spread and normal wicks may take you out.");
  }
  if (stopDistancePct > 8) {
    warnings.push("Stop distance is wide (>8% of price). Position size shrinks accordingly; make sure the setup justifies the size.");
  }
  if (riskPct > 5) {
    warnings.push("More than 5% risk on one idea. A short losing streak at this size is difficult to recover from.");
  }
  if (exposurePct > 500 && marginRequired === null) {
    warnings.push("Notional exposure is over 5× the account balance with no leverage specified.");
  }
  if (input.openExposure && input.openExposure > 0) {
    const totalRisk = (input.openExposure + maxRiskAmount) / balance;
    if (totalRisk > 0.06) {
      warnings.push(
        `Combined risk with open exposure is ${(totalRisk * 100).toFixed(1)}% of the account — above the 6% portfolio heat guideline.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    symbol: input.symbol,
    direction: input.direction,
    maxRiskAmount: roundTo(maxRiskAmount, 2),
    stopDistance: roundTo(stopDistance, precision),
    stopDistancePct: roundTo(stopDistancePct, 3),
    takeProfitDistance: roundTo(tpDistance, precision),
    positionSize: roundTo(positionSize, 6),
    notional: roundTo(notional, 2),
    marginRequired: marginRequired === null ? null : roundTo(marginRequired, 2),
    potentialLoss: roundTo(maxRiskAmount, 2),
    potentialProfit: roundTo(maxRiskAmount * riskReward, 2),
    riskReward: roundTo(riskReward, 2),
    breakEvenMove: roundTo(breakEvenMove, 3),
    exposurePct: roundTo(exposurePct, 1),
    warnings,
  };
}

/**
 * Kelly-fraction sanity check, capped hard. Presented as a ceiling to compare
 * against, never as advice to size up.
 */
export function kellyCeiling(winRate: number, avgWin: number, avgLoss: number): number {
  if (avgLoss <= 0 || winRate <= 0 || winRate >= 1) return 0;
  const b = avgWin / avgLoss;
  const k = winRate - (1 - winRate) / b;
  return roundTo(clamp(k * 100, 0, 25), 2);
}

/** Portfolio heat: total open risk as a share of equity. */
export function portfolioHeat(openRisk: number, equity: number): number {
  if (equity <= 0) return 0;
  return roundTo((openRisk / equity) * 100, 2);
}
