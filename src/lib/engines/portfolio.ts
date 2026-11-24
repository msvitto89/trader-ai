/**
 * Portfolio Engine.
 *
 * Builds equity/performance analytics strictly from closed paper trades. Real
 * and simulated performance are never blended: this engine only ever receives
 * paper positions, and the UI labels the output accordingly.
 */

import { roundTo } from "../format";
import type { EquityPoint, JournalEntry, PortfolioSummary, Position } from "../types";

const DAY = 86_400_000;

interface Trade {
  symbol: string;
  direction: "long" | "short";
  pnl: number;
  openedAt: number;
  closedAt: number;
  style: string;
  size: number;
  entry: number;
}

function closedTrades(positions: Position[], journal: JournalEntry[]): Trade[] {
  const fromPaper: Trade[] = positions
    .filter((p) => p.closedAt && p.pnl != null)
    .map((p) => ({
      symbol: p.symbol,
      direction: p.direction,
      pnl: p.pnl as number,
      openedAt: p.openedAt,
      closedAt: p.closedAt as number,
      style: p.source === "ai-setup" ? "ai" : "manual",
      size: p.size,
      entry: p.entry,
    }));

  const fromJournal: Trade[] = journal.map((j) => ({
    symbol: j.symbol,
    direction: j.direction,
    pnl: j.pnl,
    openedAt: j.openedAt,
    closedAt: j.closedAt,
    style: j.strategy,
    size: j.size,
    entry: j.entry,
  }));

  return [...fromPaper, ...fromJournal].sort((a, b) => a.closedAt - b.closedAt);
}

export function buildPortfolio(args: {
  startingEquity: number;
  currency: string;
  positions: Position[];
  journal: JournalEntry[];
  openPositions: { unrealizedPnl: number; riskAmount: number }[];
  priceOf: (symbol: string) => number;
}): PortfolioSummary {
  const { startingEquity, currency, positions, journal, openPositions } = args;
  const trades = closedTrades(positions, journal);

  const realizedPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const unrealizedPnl = openPositions.reduce((a, p) => a + p.unrealizedPnl, 0);
  const openRisk = openPositions.reduce((a, p) => a + Math.abs(p.riskAmount), 0);

  // Trade-by-trade equity path (every closed trade, chronological).
  const now = Date.now();
  const tradePath: EquityPoint[] = [];
  let equity = startingEquity;
  tradePath.push({ t: trades[0]?.closedAt ? trades[0].closedAt - DAY : now - 30 * DAY, equity });
  for (const t of trades) {
    equity += t.pnl;
    tradePath.push({ t: t.closedAt, equity: roundTo(equity, 2) });
  }
  tradePath.push({ t: now, equity: roundTo(equity + unrealizedPnl, 2) });

  // Drawdown is computed on the full trade path — collapsing points for
  // display must never hide an intraday trough.
  let peak = startingEquity;
  let maxDD = 0;
  let currentDD = 0;
  for (const p of tradePath) {
    peak = Math.max(peak, p.equity);
    const dd = peak > 0 ? ((peak - p.equity) / peak) * 100 : 0;
    maxDD = Math.max(maxDD, dd);
    currentDD = dd;
  }

  // Display curve is downsampled to daily closes for readability only.
  const dailyCurve = new Map<string, EquityPoint>();
  for (const p of tradePath) {
    dailyCurve.set(new Date(p.t).toISOString().slice(0, 10), p);
  }
  const curve = [...dailyCurve.values()].sort((a, b) => a.t - b.t);

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const expectancy = trades.length
    ? (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss
    : 0;

  const sumSince = (ms: number) =>
    roundTo(trades.filter((t) => t.closedAt >= now - ms).reduce((a, t) => a + t.pnl, 0), 2);

  // Daily P&L series for the last 30 days.
  const dailyPnlMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const key = new Date(now - i * DAY).toISOString().slice(0, 10);
    dailyPnlMap.set(key, 0);
  }
  for (const t of trades) {
    const key = new Date(t.closedAt).toISOString().slice(0, 10);
    if (dailyPnlMap.has(key)) dailyPnlMap.set(key, (dailyPnlMap.get(key) ?? 0) + t.pnl);
  }
  const dailyPnlSeries = [...dailyPnlMap.entries()].map(([date, pnl]) => ({
    t: new Date(`${date}T00:00:00Z`).getTime(),
    pnl: roundTo(pnl, 2),
  }));

  // Allocation by notional exposure of open positions plus realised symbol weight.
  const allocationMap = new Map<string, number>();
  for (const p of positions) {
    const notional = p.size * p.entry;
    allocationMap.set(p.symbol, (allocationMap.get(p.symbol) ?? 0) + (p.closedAt ? 0 : notional));
  }
  for (const j of journal.slice(-40)) {
    allocationMap.set(j.symbol, (allocationMap.get(j.symbol) ?? 0) + Math.abs(j.pnl));
  }
  const allocationTotal = [...allocationMap.values()].reduce((a, b) => a + b, 0) || 1;
  const allocation = [...allocationMap.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({
      label,
      value: roundTo(value, 2),
      pct: roundTo((value / allocationTotal) * 100, 1),
    }));

  const bySymbolMap = new Map<string, { trades: number; pnl: number; wins: number }>();
  const byStyleMap = new Map<string, { trades: number; pnl: number; wins: number }>();
  for (const t of trades) {
    const s = bySymbolMap.get(t.symbol) ?? { trades: 0, pnl: 0, wins: 0 };
    s.trades += 1;
    s.pnl += t.pnl;
    if (t.pnl > 0) s.wins += 1;
    bySymbolMap.set(t.symbol, s);

    const st = byStyleMap.get(t.style) ?? { trades: 0, pnl: 0, wins: 0 };
    st.trades += 1;
    st.pnl += t.pnl;
    if (t.pnl > 0) st.wins += 1;
    byStyleMap.set(t.style, st);
  }

  const totalEquity = startingEquity + realizedPnl + unrealizedPnl;

  return {
    currency,
    startingEquity: roundTo(startingEquity, 2),
    totalEquity: roundTo(totalEquity, 2),
    availableBalance: roundTo(startingEquity + realizedPnl, 2),
    unrealizedPnl: roundTo(unrealizedPnl, 2),
    realizedPnl: roundTo(realizedPnl, 2),
    dailyPnl: sumSince(DAY),
    weeklyPnl: sumSince(7 * DAY),
    monthlyPnl: sumSince(30 * DAY),
    winRate: roundTo(winRate, 1),
    profitFactor: grossLoss > 0 ? roundTo(grossWin / grossLoss, 2) : grossWin > 0 ? 99 : 0,
    maxDrawdownPct: roundTo(maxDD, 2),
    currentDrawdownPct: roundTo(currentDD, 2),
    trades: trades.length,
    avgWin: roundTo(avgWin, 2),
    avgLoss: roundTo(avgLoss, 2),
    expectancy: roundTo(expectancy, 2),
    riskExposurePct: totalEquity > 0 ? roundTo((openRisk / totalEquity) * 100, 2) : 0,
    equityCurve: curve,
    dailyPnlSeries,
    allocation,
    bySymbol: [...bySymbolMap.entries()]
      .map(([symbol, v]) => ({
        symbol,
        trades: v.trades,
        pnl: roundTo(v.pnl, 2),
        winRate: roundTo((v.wins / v.trades) * 100, 1),
      }))
      .sort((a, b) => b.pnl - a.pnl),
    byStyle: [...byStyleMap.entries()]
      .map(([style, v]) => ({
        style,
        trades: v.trades,
        pnl: roundTo(v.pnl, 2),
        winRate: roundTo((v.wins / v.trades) * 100, 1),
      }))
      .sort((a, b) => b.pnl - a.pnl),
  };
}

/**
 * Unrealised P&L for an open position, incl. the risk still at stake if the
 * stop is hit from the current price.
 */
export function positionMetrics(
  position: Position,
  currentPrice: number,
): { unrealizedPnl: number; unrealizedPct: number; riskAmount: number; distanceToStopPct: number | null; distanceToTpPct: number | null; rMultiple: number } {
  const dir = position.direction === "long" ? 1 : -1;
  const unrealizedPnl = (currentPrice - position.entry) * position.size * dir;
  const unrealizedPct = position.entry ? ((currentPrice - position.entry) / position.entry) * 100 * dir : 0;

  const riskPerUnit = position.stop != null ? Math.abs(position.entry - position.stop) : 0;
  const riskAmount = riskPerUnit * position.size;
  const rMultiple = riskPerUnit > 0 ? (currentPrice - position.entry) * dir / riskPerUnit : 0;

  return {
    unrealizedPnl: roundTo(unrealizedPnl, 2),
    unrealizedPct: roundTo(unrealizedPct, 2),
    riskAmount: roundTo(riskAmount, 2),
    distanceToStopPct: position.stop != null ? roundTo((Math.abs(currentPrice - position.stop) / currentPrice) * 100, 2) : null,
    distanceToTpPct: position.takeProfit != null ? roundTo((Math.abs(position.takeProfit - currentPrice) / currentPrice) * 100, 2) : null,
    rMultiple: roundTo(rMultiple, 2),
  };
}

export function closePosition(position: Position, exitPrice: number, now = Date.now()): Position {
  const dir = position.direction === "long" ? 1 : -1;
  const pnl = (exitPrice - position.entry) * position.size * dir;
  return {
    ...position,
    closedAt: now,
    exitPrice,
    pnl: roundTo(pnl, 2),
    pnlPct: position.entry ? roundTo(((exitPrice - position.entry) / position.entry) * 100 * dir, 2) : 0,
  };
}
