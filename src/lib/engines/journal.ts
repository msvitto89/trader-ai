/**
 * Trading Journal Analyzer.
 *
 * Produces evidence-based, sample-size-aware observations about the trader's
 * own history. Each insight carries the n it is derived from and refuses to
 * generalise from tiny samples — a journal that "discovers" a pattern from
 * three trades is worse than no journal.
 */

import { roundTo } from "../format";
import type { JournalEntry, JournalInsight } from "../types";

const MIN_SAMPLE = 8;

function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return map;
}

function stats(entries: JournalEntry[]) {
  const wins = entries.filter((e) => e.pnl > 0);
  const losses = entries.filter((e) => e.pnl < 0);
  const grossWin = wins.reduce((a, e) => a + e.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, e) => a + e.pnl, 0));
  return {
    n: entries.length,
    winRate: entries.length ? (wins.length / entries.length) * 100 : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    pnl: roundTo(entries.reduce((a, e) => a + e.pnl, 0), 2),
    avgR: entries.filter((e) => e.rMultiple != null).length
      ? entries.filter((e) => e.rMultiple != null).reduce((a, e) => a + (e.rMultiple as number), 0) /
        entries.filter((e) => e.rMultiple != null).length
      : 0,
  };
}

const STYLE_LABEL: Record<string, string> = {
  scalping: "scalping",
  day: "day trading",
  swing: "swing trading",
  longterm: "long-term positions",
  other: "uncategorised trades",
};

export function analyzeJournal(entries: JournalEntry[]): JournalInsight[] {
  const insights: JournalInsight[] = [];
  const sorted = [...entries].sort((a, b) => a.closedAt - b.closedAt);
  const total = stats(sorted);

  if (sorted.length < 5) {
    return [
      {
        id: "insufficient",
        title: "Not enough history yet",
        detail: `You have ${sorted.length} recorded ${sorted.length === 1 ? "trade" : "trades"}. Journal insights need at least ${MIN_SAMPLE} to avoid reading noise as a pattern. Keep logging — including the trades you are not proud of, which carry the most information.`,
        severity: "watch",
        sampleSize: sorted.length,
      },
    ];
  }

  // ── Style performance ─────────────────────────────────────────
  const byStyle = group(sorted, (e) => e.strategy);
  const styleStats = [...byStyle.entries()]
    .map(([style, es]) => ({ style, ...stats(es) }))
    .filter((s) => s.n >= 3)
    .sort((a, b) => b.avgR - a.avgR);

  if (styleStats.length >= 2) {
    const best = styleStats[0];
    const worst = styleStats[styleStats.length - 1];
    if (Math.abs(best.avgR - worst.avgR) > 0.2) {
      insights.push({
        id: "style-edge",
        title: `Your edge concentrates in ${STYLE_LABEL[best.style] ?? best.style}`,
        detail: `Across ${best.n} trades you average ${best.avgR.toFixed(2)}R in ${STYLE_LABEL[best.style] ?? best.style} (${best.winRate.toFixed(0)}% win rate, $${best.pnl.toFixed(0)} net). In ${STYLE_LABEL[worst.style] ?? worst.style} you average ${worst.avgR.toFixed(2)}R over ${worst.n} trades ($${worst.pnl.toFixed(0)} net). Concentrating risk in the stronger style is the highest-leverage change available to you.`,
        severity: "positive",
        metric: `${best.avgR.toFixed(2)}R vs ${worst.avgR.toFixed(2)}R`,
        sampleSize: best.n + worst.n,
      });
    }
  }

  // ── Loss size vs win size ─────────────────────────────────────
  if (total.avgWin > 0 && total.avgLoss > 0) {
    const ratio = total.avgWin / total.avgLoss;
    if (ratio < 1) {
      insights.push({
        id: "loss-asymmetry",
        title: "Your average loss is larger than your average win",
        detail: `Average win $${total.avgWin.toFixed(0)} vs average loss $${total.avgLoss.toFixed(0)} (ratio ${ratio.toFixed(2)}). With a ${total.winRate.toFixed(0)}% win rate, this profile needs an unrealistic hit rate to compound. Two fixes, in order: cut losers at the planned stop instead of widening it, and let winners run to the first target rather than taking them early.`,
        severity: "risk",
        metric: `${ratio.toFixed(2)}:1 win/loss size`,
        sampleSize: total.n,
      });
    } else if (ratio > 1.6) {
      insights.push({
        id: "loss-discipline",
        title: "You are cutting losses and letting winners run",
        detail: `Average win $${total.avgWin.toFixed(0)} against an average loss of $${total.avgLoss.toFixed(0)}. That ${ratio.toFixed(2)}:1 payoff means a ${total.winRate.toFixed(0)}% win rate is comfortably profitable. Protect this behaviour: it is the single hardest skill to build.`,
        severity: "positive",
        metric: `${ratio.toFixed(2)}:1 payoff`,
        sampleSize: total.n,
      });
    }
  }

  // ── Entry quality after large moves (chasing) ─────────────────
  const withR = sorted.filter((e) => e.rMultiple != null);
  if (withR.length >= MIN_SAMPLE) {
    const chased = withR.filter((e) => Math.abs(e.rMultiple as number) > 2 && e.pnl < 0);
    const patience = withR.length - chased.length;
    if (chased.length / withR.length > 0.4) {
      insights.push({
        id: "chasing",
        title: "Late entries are costing you",
        detail: `${chased.length} of ${withR.length} trades show a stop distance over 2R from entry — the signature of entering after the move has already extended. Those trades carry the worst outcomes. A practical rule: if price is more than one ATR away from your planned entry zone, skip it and wait for the retest.`,
        severity: "risk",
        metric: `${Math.round((chased.length / withR.length) * 100)}% late entries`,
        sampleSize: withR.length,
      });
    } else if (patience / withR.length > 0.7) {
      insights.push({
        id: "patience",
        title: "Entries are well placed",
        detail: `${patience} of ${withR.length} trades were entered within 2R of the planned stop, which shows you are waiting for your levels rather than chasing price. Execution discipline is holding up.`,
        severity: "positive",
        sampleSize: withR.length,
      });
    }
  }

  // ── Losing streak clustering ──────────────────────────────────
  let maxLoseStreak = 0;
  let streak = 0;
  for (const e of sorted) {
    if (e.pnl < 0) {
      streak += 1;
      maxLoseStreak = Math.max(maxLoseStreak, streak);
    } else streak = 0;
  }
  if (maxLoseStreak >= 4) {
    insights.push({
      id: "drawdown-cluster",
      title: "Your losses cluster",
      detail: `Your longest losing run is ${maxLoseStreak} trades. Clustering usually means position size stays constant through a bad patch, or one market condition is hitting several correlated positions at once. A rule that halves size after two consecutive losses would materially cut the drawdown depth.`,
      severity: "risk",
      metric: `${maxLoseStreak} consecutive losses`,
      sampleSize: total.n,
    });
  }

  // ── Long vs short asymmetry ───────────────────────────────────
  const byDir = group(sorted, (e) => e.direction);
  if (byDir.size === 2) {
    const longs = stats(byDir.get("long") ?? []);
    const shorts = stats(byDir.get("short") ?? []);
    if (longs.n >= 4 && shorts.n >= 4 && Math.abs(longs.avgR - shorts.avgR) > 0.35) {
      const better = longs.avgR > shorts.avgR ? "longs" : "shorts";
      insights.push({
        id: "direction-bias",
        title: `You handle ${better} better`,
        detail: `${longs.n} longs average ${longs.avgR.toFixed(2)}R (${longs.winRate.toFixed(0)}% win), while ${shorts.n} shorts average ${shorts.avgR.toFixed(2)}R (${shorts.winRate.toFixed(0)}% win). This is not a reason to stop taking one side — it is a reason to demand more confluence before taking the weaker side.`,
        severity: "watch",
        metric: `${longs.avgR.toFixed(2)}R L / ${shorts.avgR.toFixed(2)}R S`,
        sampleSize: longs.n + shorts.n,
      });
    }
  }

  // ── Instrument concentration ──────────────────────────────────
  const bySymbol = [...group(sorted, (e) => e.symbol).entries()]
    .map(([symbol, es]) => ({ symbol, ...stats(es) }))
    .sort((a, b) => b.n - a.n);
  if (bySymbol.length >= 2 && bySymbol[0].n / total.n > 0.55) {
    insights.push({
      id: "concentration",
      title: `Most of your risk sits in ${bySymbol[0].symbol}`,
      detail: `${bySymbol[0].n} of ${total.n} trades (${Math.round((bySymbol[0].n / total.n) * 100)}%) are in ${bySymbol[0].symbol}, netting $${bySymbol[0].pnl.toFixed(0)}. Concentration is not automatically wrong, but your results are now a bet on one instrument's behaviour rather than a diversified process.`,
      severity: "watch",
      metric: `${Math.round((bySymbol[0].n / total.n) * 100)}% concentration`,
      sampleSize: total.n,
    });
  }

  // ── Overtrading signal ────────────────────────────────────────
  const sortedByDay = group(sorted, (e) => new Date(e.closedAt).toISOString().slice(0, 10));
  const avgPerDay = sorted.length / Math.max(1, sortedByDay.size);
  const heaviestDay = [...sortedByDay.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (heaviestDay && heaviestDay[1].length > avgPerDay * 2.5 && heaviestDay[1].length >= 4) {
    const heavyStats = stats(heaviestDay[1]);
    if (heavyStats.pnl < 0) {
      insights.push({
        id: "overtrading",
        title: "Your busiest days lose money",
        detail: `On ${heaviestDay[0]} you closed ${heaviestDay[1].length} trades (versus ${avgPerDay.toFixed(1)} on a typical day) for $${heavyStats.pnl.toFixed(0)}. Volume and quality are inversely related for most discretionary traders. A daily trade cap is a cheap, mechanical fix.`,
        severity: "risk",
        metric: `${heaviestDay[1].length} trades on the worst day`,
        sampleSize: total.n,
      });
    }
  }

  // ── Overall discipline summary ────────────────────────────────
  if (total.n >= MIN_SAMPLE) {
    const profitable = total.pnl > 0;
    insights.push({
      id: "summary",
      title: profitable ? "Process is net positive" : "Process is net negative — fix before scaling",
      detail: `Across ${total.n} trades: ${total.winRate.toFixed(0)}% win rate, average ${total.avgR.toFixed(2)}R, net $${total.pnl.toFixed(0)}. ${profitable ? "Hold size steady and refine the weakest observation above rather than increasing risk." : "Do not increase size while the expectancy is negative; the fixes above matter more than another setup."}`,
      severity: profitable ? "positive" : "watch",
      metric: `${total.avgR.toFixed(2)}R expectancy`,
      sampleSize: total.n,
    });
  }

  return insights;
}

/** Graded scorecard for the journal page. */
export function journalScorecard(entries: JournalEntry[]): {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "bad" | "muted";
}[] {
  const s = stats(entries);
  const withR = entries.filter((e) => e.rMultiple != null);
  const avgR = s.avgR;
  const discipline =
    withR.length === 0
      ? 0
      : (withR.filter((e) => (e.rMultiple as number) >= -1.05).length / withR.length) * 100;

  const tone = (val: number, good: number, warn: number): "good" | "warn" | "bad" =>
    val >= good ? "good" : val >= warn ? "warn" : "bad";

  return [
    {
      label: "Expectancy",
      value: `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`,
      hint: avgR > 0 ? "Positive expectancy per trade" : "Negative expectancy — reduce size",
      tone: avgR > 0.15 ? "good" : avgR > 0 ? "warn" : "bad",
    },
    {
      label: "Win rate",
      value: `${s.winRate.toFixed(0)}%`,
      hint: "Share of closed trades that finished green",
      tone: tone(s.winRate, 50, 40),
    },
    {
      label: "Stop discipline",
      value: withR.length ? `${discipline.toFixed(0)}%` : "—",
      hint: "Trades closed at or above −1R (losses respected)",
      tone: withR.length ? tone(discipline, 85, 65) : "muted",
    },
    {
      label: "Payoff ratio",
      value: s.avgLoss > 0 ? `${(s.avgWin / s.avgLoss).toFixed(2)}:1` : "—",
      hint: "Average win divided by average loss",
      tone: s.avgLoss > 0 ? tone(s.avgWin / s.avgLoss, 1.4, 1) : "muted",
    },
  ];
}
