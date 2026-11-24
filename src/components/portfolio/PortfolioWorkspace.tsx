"use client";

/**
 * Portfolio.
 *
 * Equity, performance and exposure built from the paper ledger + journal.
 * Everything here is labelled as paper performance — real-money integration is
 * a future broker layer, not a tweak to this page.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlaskConical, Lock, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import {
  Alert,
  Badge,
  DemoBadge,
  EmptyState,
  Panel,
  ProgressBar,
  SectionHeading,
  Skeleton,
  StatRow,
} from "@/components/ui";
import { fmtMoney, fmtPct, fmtPrice, fmtQty } from "@/lib/format";
import { STYLE_LABEL } from "@/lib/constants";
import type { JournalInsight, PortfolioSummary, Position } from "@/lib/types";

interface PortfolioResponse {
  summary: PortfolioSummary;
  marks: {
    position: Position;
    mark: number;
    unrealizedPnl: number;
    unrealizedPct: number;
    riskAmount: number;
    rMultiple: number;
    distanceToStopPct: number | null;
    distanceToTpPct: number | null;
  }[];
  source: "demo" | "live";
  journalInsights: JournalInsight[];
  analyticsLocked: boolean;
}

export function PortfolioWorkspace() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PortfolioResponse>("/api/portfolio")
      .then(setData)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load portfolio."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert tone="danger">{error ?? "Portfolio unavailable."}</Alert>;
  }

  const p = data.summary;
  const hasData = p.trades > 0 || data.marks.length > 0;

  return (
    <div>
      <SectionHeading
        eyebrow="Portfolio"
        title="Performance & exposure"
        description="Built from your paper ledger and journal. Simulated performance is never presented as live trading results."
        action={<DemoBadge source={data.source} />}
      />

      <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-hairline-2 bg-surface px-3 py-2">
        <FlaskConical className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.9} />
        <p className="text-[10.5px] text-ink-3">
          All figures on this page are <span className="text-ink-2">paper trading</span> and journal-derived
          performance. Starting equity {fmtMoney(p.startingEquity)}.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Headline label="Total equity" value={fmtMoney(p.totalEquity)} sub={`${fmtMoney(p.unrealizedPnl, { sign: true })} unrealised`} />
        <Headline label="Available balance" value={fmtMoney(p.availableBalance)} sub={`${fmtMoney(p.realizedPnl, { sign: true })} realised`} />
        <Headline
          label="Daily P&L"
          value={fmtMoney(p.dailyPnl, { sign: true })}
          tone={p.dailyPnl >= 0 ? "bull" : "bear"}
          sub={`Week ${fmtMoney(p.weeklyPnl, { sign: true })}`}
        />
        <Headline
          label="Month P&L"
          value={fmtMoney(p.monthlyPnl, { sign: true })}
          tone={p.monthlyPnl >= 0 ? "bull" : "bear"}
          sub={`${p.trades} closed trades`}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Headline label="Win rate" value={`${p.winRate.toFixed(1)}%`} sub={`${p.trades} trades`} />
        <Headline label="Profit factor" value={p.profitFactor.toFixed(2)} sub={p.profitFactor >= 1.5 ? "healthy" : p.profitFactor >= 1 ? "marginal" : "negative"} tone={p.profitFactor >= 1.5 ? "bull" : p.profitFactor < 1 ? "bear" : undefined} />
        <Headline label="Max drawdown" value={`${p.maxDrawdownPct.toFixed(1)}%`} sub="peak to trough" tone={p.maxDrawdownPct > 15 ? "bear" : undefined} />
        <Headline label="Risk exposure" value={`${p.riskExposurePct.toFixed(1)}%`} sub={data.marks.length ? `${data.marks.length} open` : "no open risk"} tone={p.riskExposurePct > 6 ? "bear" : undefined} />
      </div>

      {!hasData && (
        <div className="mt-3">
          <Panel>
            <EmptyState
              icon={<Wallet className="size-4" />}
              title="No performance data yet"
              description="Open a paper trade or log a closed trade and the equity curve, drawdown and allocation analytics populate from real entries — never from placeholder numbers."
              action={
                <div className="flex gap-2">
                  <Link href="/app/signals" className="inline-flex h-8 items-center rounded-[6px] bg-accent px-3 text-[12px] font-semibold text-accent-ink">
                    Find a setup
                  </Link>
                  <Link href="/app/journal" className="inline-flex h-8 items-center rounded-[6px] border border-hairline-2 bg-surface-3 px-3 text-[12px] text-ink">
                    Open journal
                  </Link>
                </div>
              }
            />
          </Panel>
        </div>
      )}

      {hasData && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-3">
            <Panel title="Equity curve" subtitle="Realised plus current unrealised, from your paper ledger">
              <EquityCurve points={p.equityCurve} starting={p.startingEquity} />
            </Panel>

            <Panel title="Daily P&L" subtitle="Last 30 days, realised">
              <PnlBars series={p.dailyPnlSeries} />
            </Panel>

            {/* Open positions */}
            {data.marks.length > 0 && (
              <Panel dense title="Open exposure" subtitle={`${data.marks.length} position${data.marks.length === 1 ? "" : "s"} · risk ${fmtMoney(data.marks.reduce((a, m) => a + Math.abs(m.riskAmount), 0))} at stops`}>
                <div className="overflow-x-auto">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Side</th>
                        <th className="text-right">Entry</th>
                        <th className="text-right">Mark</th>
                        <th className="text-right">Size</th>
                        <th className="text-right">Unrealised</th>
                        <th className="text-right">R</th>
                        <th className="text-right">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.marks.map((m) => (
                        <tr key={m.position.id}>
                          <td className="font-medium text-ink">{m.position.symbol}</td>
                          <td>
                            <Badge tone={m.position.direction === "long" ? "bull" : "bear"}>{m.position.direction}</Badge>
                          </td>
                          <td className="tnum text-right text-ink-2">{fmtPrice(m.position.entry, m.position.symbol)}</td>
                          <td className="tnum text-right text-ink-2">{fmtPrice(m.mark, m.position.symbol)}</td>
                          <td className="tnum text-right text-ink-3">{fmtQty(m.position.size, m.position.symbol)}</td>
                          <td className={cn("tnum text-right font-medium", m.unrealizedPnl >= 0 ? "text-bull" : "text-bear")}>
                            {fmtMoney(m.unrealizedPnl, { sign: true })}
                          </td>
                          <td className={cn("tnum text-right", m.rMultiple >= 0 ? "text-bull" : "text-bear")}>
                            {m.rMultiple.toFixed(2)}
                          </td>
                          <td className="tnum text-right text-ink-3">{m.riskAmount ? fmtMoney(m.riskAmount) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>

          <div className="space-y-3">
            <Panel title="Risk exposure" subtitle="Share of equity currently at stake">
              <div className="flex items-baseline justify-between">
                <span className={cn("tnum text-[24px] font-medium", p.riskExposurePct > 6 ? "text-bear" : "text-ink")}>
                  {p.riskExposurePct.toFixed(2)}%
                </span>
                <span className="text-[10px] text-ink-4">guideline 6%</span>
              </div>
              <ProgressBar
                value={Math.min(100, (p.riskExposurePct / 10) * 100)}
                tone={p.riskExposurePct > 6 ? "bear" : p.riskExposurePct > 3 ? "accent" : "bull"}
                className="mt-2"
              />
              <div className="mt-3">
                <StatRow label="Avg win" value={fmtMoney(p.avgWin)} tone="bull" />
                <StatRow label="Avg loss" value={fmtMoney(p.avgLoss)} tone="bear" />
                <StatRow label="Expectancy / trade" value={fmtMoney(p.expectancy, { sign: true })} tone={p.expectancy >= 0 ? "bull" : "bear"} />
                <StatRow label="Current drawdown" value={`${p.currentDrawdownPct.toFixed(1)}%`} />
              </div>
            </Panel>

            <Panel title="Allocation" subtitle="By open notional and recent P&L weight">
              {p.allocation.length ? (
                <div className="space-y-2">
                  {p.allocation.map((a, i) => (
                    <div key={a.label}>
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-ink-2">{a.label}</span>
                        <span className="tnum text-ink-4">{a.pct.toFixed(1)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${a.pct}%`, opacity: 1 - i * 0.12 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-ink-4">No allocation data yet.</p>
              )}
            </Panel>

            <Panel title="By style">
              {p.byStyle.length ? (
                <div className="space-y-1.5">
                  {p.byStyle.map((s) => (
                    <div key={s.style} className="flex items-center justify-between gap-2 text-[11.5px]">
                      <span className="text-ink-2">{STYLE_LABEL[s.style] ?? s.style}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-ink-4">{s.trades}t · {s.winRate.toFixed(0)}%</span>
                        <span className={cn("tnum w-16 text-right", s.pnl >= 0 ? "text-bull" : "text-bear")}>
                          {fmtMoney(s.pnl, { sign: true, compact: true })}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-ink-4">Close a trade to see style breakdown.</p>
              )}
            </Panel>

            <Panel
              title="Advanced analytics"
              action={data.analyticsLocked ? <Lock className="size-3.5 text-accent" strokeWidth={2} /> : undefined}
            >
              {data.analyticsLocked ? (
                <div className="py-2 text-center">
                  <p className="text-[11px] leading-relaxed text-ink-3">
                    Pro adds rolling Sharpe, exposure-by-correlation, per-setup quality analysis and
                    month-over-month attribution.
                  </p>
                  <Link
                    href="/app/settings?tab=billing"
                    className="mt-3 inline-flex rounded-[6px] bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-accent-ink"
                  >
                    Compare plans
                  </Link>
                </div>
              ) : data.journalInsights.length ? (
                <div className="space-y-1.5">
                  {data.journalInsights.map((i) => (
                    <p key={i.id} className="text-[10.5px] leading-relaxed text-ink-3">
                      <span className="text-ink-2">{i.title}.</span> {i.detail}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-ink-4">Log more trades to unlock analytics.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Headline({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "bull" | "bear";
}) {
  return (
    <div className="panel-flat px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className={cn("tnum mt-0.5 text-[17px] font-medium tracking-[-0.01em]", tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-ink")}>
        {value}
      </div>
      <div className="truncate text-[9.5px] text-ink-4">{sub}</div>
    </div>
  );
}

function EquityCurve({ points, starting }: { points: { t: number; equity: number }[]; starting: number }) {
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-[11px] text-ink-4">Not enough closed trades to plot an equity curve.</p>
      </div>
    );
  }
  const width = 640;
  const height = 160;
  const values = points.map((p) => p.equity);
  const min = Math.min(...values, starting);
  const max = Math.max(...values, starting);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / range) * (height - 16) - 8;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = values[values.length - 1];
  const up = last >= starting;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={cn("tnum text-[18px] font-medium", up ? "text-bull" : "text-bear")}>{fmtMoney(last)}</span>
        <span className="tnum text-[10.5px] text-ink-4">
          {fmtPct(((last - starting) / starting) * 100, { sign: true })} vs start
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="mt-2" role="img" aria-label="Equity curve">
        <defs>
          <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "#3fae86" : "#d2595c"} stopOpacity="0.18" />
            <stop offset="100%" stopColor={up ? "#3fae86" : "#d2595c"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={width} y1={y(starting)} y2={y(starting)} stroke="#2c313a" strokeWidth="1" strokeDasharray="3 3" />
        <path d={area} fill="url(#eqfill)" />
        <path d={line} fill="none" stroke={up ? "#3fae86" : "#d2595c"} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function PnlBars({ series }: { series: { t: number; pnl: number }[] }) {
  if (!series.some((s) => s.pnl !== 0)) {
    return (
      <div className="flex h-24 items-center justify-center">
        <p className="text-[11px] text-ink-4">No realised P&L in the last 30 days.</p>
      </div>
    );
  }
  const max = Math.max(...series.map((s) => Math.abs(s.pnl)), 1);
  return (
    <div className="flex h-24 items-end gap-[3px]">
      {series.map((s) => {
        const h = (Math.abs(s.pnl) / max) * 100;
        return (
          <div key={s.t} className="group relative flex-1" title={`${new Date(s.t).toISOString().slice(0, 10)}: ${fmtMoney(s.pnl, { sign: true })}`}>
            <div className="flex h-24 flex-col justify-center">
              <div className="flex h-1/2 items-end">
                {s.pnl > 0 && <div className="w-full rounded-t-[1px] bg-bull/80" style={{ height: `${h}%` }} />}
              </div>
              <div className="flex h-1/2 items-start">
                {s.pnl < 0 && <div className="w-full rounded-b-[1px] bg-bear/80" style={{ height: `${h}%` }} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
