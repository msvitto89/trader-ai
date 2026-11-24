"use client";

/**
 * Home — the daily briefing and workspace entry point.
 *
 * Answers four questions in order: what is the market doing, what is worth
 * watching, what are the risks today, and where do I stand.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  FlaskConical,
  Radar,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Badge,
  Button,
  DemoBadge,
  EmptyState,
  LinkButton,
  Panel,
  ProgressBar,
  Skeleton,
} from "@/components/ui";
import { fmtMoney, fmtTimeAgo, fmtUtcClock } from "@/lib/format";
import { STYLE_LABEL } from "@/lib/constants";
import type { DailyBriefing, PortfolioSummary, Position, UsageLimits } from "@/lib/types";

interface HomeData {
  briefing: DailyBriefing;
  portfolio: PortfolioSummary | null;
  marks: { position: Position; mark: number; unrealizedPnl: number; rMultiple: number }[];
  usage: UsageLimits | null;
  marketData: { source: "demo" | "live"; label: string };
}

export function HomeWorkspace() {
  const { user, refresh } = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [briefing, portfolio, paper, me] = await Promise.all([
        api.get<{ briefing: DailyBriefing }>("/api/briefing"),
        api.get<{ summary: PortfolioSummary; marks: HomeData["marks"] }>("/api/portfolio").catch(() => null),
        api.get<{ positions: Position[] }>("/api/paper").catch(() => null),
        api.get<{ usage: UsageLimits | null; marketData: HomeData["marketData"] }>("/api/me"),
      ]);
      void paper;
      setData({
        briefing: briefing.briefing,
        portfolio: portfolio?.summary ?? null,
        marks: portfolio?.marks ?? [],
        usage: me.usage,
        marketData: me.marketData,
      });
      void refresh();
    } catch {
      /* surfaced by the skeleton staying empty */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name.split(" ")[0] ?? "trader";

  return (
    <div>
      {/* ── Greeting ─────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Daily briefing · {new Date().toISOString().slice(0, 10)}</div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">
            {greeting}, {firstName}.
          </h1>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {user && (
              <>
                {STYLE_LABEL[user.preferences.style]} · {user.preferences.defaultRiskPct}% risk per trade ·{" "}
                {user.watchlist.length} instruments watched
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && <DemoBadge source={data.marketData.source} />}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            loading={refreshing}
          >
            <RefreshCw className="size-3.5" strokeWidth={2} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-3 lg:grid-cols-3">
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
          </div>
        </div>
      ) : data ? (
        <>
          {/* ── Briefing headline ─────────────────────────────── */}
          <div className="panel mb-3 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-accent" strokeWidth={2} />
                <span className="text-[12px] font-semibold">Today&apos;s market</span>
                <Badge tone="muted">{data.briefing.marketOverview.length} majors</Badge>
              </div>
              <span className="text-[10px] text-ink-4">
                Generated {fmtTimeAgo(data.briefing.generatedAt)} · {fmtUtcClock(data.briefing.generatedAt)}
              </span>
            </div>

            <div className="px-3.5 py-3">
              <p className="text-[13.5px] font-medium leading-snug text-ink">{data.briefing.headline}</p>

              <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {data.briefing.marketOverview.map((m) => (
                  <Link
                    key={m.symbol}
                    href={`/app/analyst?symbol=${encodeURIComponent(m.symbol)}`}
                    className="group flex items-center justify-between gap-2 rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-2 transition-colors hover:border-hairline-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {m.bias === "bullish" ? (
                          <TrendingUp className="size-3 text-bull" strokeWidth={2.2} />
                        ) : m.bias === "bearish" ? (
                          <TrendingDown className="size-3 text-bear" strokeWidth={2.2} />
                        ) : (
                          <span className="h-px w-3 bg-ink-4" />
                        )}
                        <span className="text-[11.5px] font-medium text-ink">{m.symbol}</span>
                      </div>
                      <div className="truncate text-[9.5px] text-ink-4">{m.note}</div>
                    </div>
                    <ChevronRight className="size-3 shrink-0 text-ink-4 group-hover:text-ink-2" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
            {/* ── Opportunities ─────────────────────────────── */}
            <div className="space-y-3">
              <Panel
                title="What to watch today"
                subtitle="Setups that cleared confluence, plus structural levels worth marking"
                action={
                  <Link href="/app/signals" className="text-[10.5px] text-accent hover:underline">
                    All signals
                  </Link>
                }
              >
                {data.briefing.opportunities.length === 0 ? (
                  <EmptyState
                    icon={<CircleAlert className="size-4" />}
                    title="No qualifying setups across the majors"
                    description="The engine found nothing worth risking capital on today. Another way to read that: your capital is safest staying where it is."
                    action={
                      <LinkButton href="/app/scanner" variant="secondary" size="sm">
                        <Radar className="size-3.5" strokeWidth={2} />
                        Scan the full market
                      </LinkButton>
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    {data.briefing.opportunities.map((o) => (
                      <Link
                        key={`${o.symbol}-${o.direction}`}
                        href={`/app/analyst?symbol=${encodeURIComponent(o.symbol)}`}
                        className="group block rounded-[7px] border border-hairline bg-surface-2 p-2.5 transition-colors hover:border-hairline-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-[3px] border px-1 py-0.5 text-[9.5px] font-semibold uppercase",
                                o.direction === "long"
                                  ? "border-[#3fae8633] bg-bull-soft text-bull"
                                  : "border-[#d2595c33] bg-bear-soft text-bear",
                              )}
                            >
                              <ArrowUpRight className={cn("size-2.5", o.direction === "short" && "rotate-90")} strokeWidth={2.6} />
                              {o.direction}
                            </span>
                            <span className="text-[12px] font-medium text-ink">{o.symbol}</span>
                            <Badge tone={o.quality === "high" ? "accent" : "info"}>{o.quality}</Badge>
                          </div>
                          <ChevronRight className="size-3.5 text-ink-4 group-hover:text-ink-2" />
                        </div>
                        <p className="mt-1 text-[10.5px] leading-relaxed text-ink-3">{o.summary}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="What to watch" subtitle="Levels and conditions to mark on your charts">
                <ul className="space-y-1.5">
                  {data.briefing.watchlistToday.map((w, i) => (
                    <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-ink-2">
                      <span className="mt-[6px] size-1 shrink-0 rounded-full bg-accent/70" />
                      {w}
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Volatility & risks" subtitle={data.briefing.volatilityNote}>
                <div className="space-y-1.5">
                  {data.briefing.risks.map((r, i) => (
                    <div key={i} className="flex gap-2 rounded-[6px] border border-[#d9a44126] bg-accent-soft px-2.5 py-2">
                      <Shield className="mt-0.5 size-3 shrink-0 text-accent" strokeWidth={2} />
                      <span className="text-[10.5px] leading-relaxed text-[#e6c894]">{r}</span>
                    </div>
                  ))}
                  {data.briefing.risks.length === 0 && (
                    <p className="text-[11px] text-ink-4">No elevated risks flagged for today.</p>
                  )}
                </div>
              </Panel>
            </div>

            {/* ── Right column ──────────────────────────────── */}
            <div className="space-y-3">
              {/* Quick actions */}
              <Panel title="Jump in">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { href: "/app/analyst", icon: Brain, label: "Analyze", sub: "AI market read" },
                    { href: "/app/scanner", icon: Radar, label: "Scan", sub: "Rank opportunities" },
                    { href: "/app/risk", icon: Shield, label: "Size risk", sub: "Position calculator" },
                    { href: "/app/paper", icon: FlaskConical, label: "Paper trade", sub: "Test a setup" },
                  ].map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      className="group rounded-[7px] border border-hairline bg-surface-2 p-2.5 transition-colors hover:border-hairline-2"
                    >
                      <a.icon className="size-3.5 text-ink-3 group-hover:text-accent" strokeWidth={1.9} />
                      <div className="mt-1.5 text-[11.5px] font-medium text-ink">{a.label}</div>
                      <div className="text-[9.5px] text-ink-4">{a.sub}</div>
                    </Link>
                  ))}
                </div>
              </Panel>

              {/* Account snapshot */}
              <Panel
                title="Your account"
                subtitle="Paper trading performance"
                action={
                  <Link href="/app/portfolio" className="text-[10.5px] text-accent hover:underline">
                    Details
                  </Link>
                }
              >
                {data.portfolio ? (
                  <div className="space-y-2.5">
                    <div>
                      <div className="eyebrow">Total equity</div>
                      <div className="tnum mt-0.5 text-[20px] font-medium">{fmtMoney(data.portfolio.totalEquity)}</div>
                      <div className="text-[10px] text-ink-4">
                        {fmtMoney(data.portfolio.realizedPnl, { sign: true })} realised ·{" "}
                        {fmtMoney(data.portfolio.unrealizedPnl, { sign: true })} open
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-hairline pt-2">
                      <Mini label="Today" value={fmtMoney(data.portfolio.dailyPnl, { sign: true })} tone={data.portfolio.dailyPnl >= 0 ? "bull" : "bear"} />
                      <Mini label="Win rate" value={data.portfolio.trades ? `${data.portfolio.winRate.toFixed(0)}%` : "—"} />
                      <Mini label="Open risk" value={`${data.portfolio.riskExposurePct.toFixed(1)}%`} tone={data.portfolio.riskExposurePct > 6 ? "bear" : undefined} />
                    </div>

                    {data.marks.length > 0 && (
                      <div className="border-t border-hairline pt-2">
                        <div className="eyebrow mb-1.5">Open positions</div>
                        {data.marks.slice(0, 3).map((m) => (
                          <div key={m.position.id} className="flex items-center justify-between py-0.5 text-[10.5px]">
                            <span className="text-ink-2">
                              {m.position.symbol}{" "}
                              <span className={m.position.direction === "long" ? "text-bull" : "text-bear"}>
                                {m.position.direction}
                              </span>
                            </span>
                            <span className={cn("tnum", m.unrealizedPnl >= 0 ? "text-bull" : "text-bear")}>
                              {fmtMoney(m.unrealizedPnl, { sign: true })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-ink-4">Account data unavailable.</p>
                )}
              </Panel>

              {/* Economic events */}
              <Panel
                title="Economic calendar"
                subtitle="High-impact releases to size around"
                action={<CalendarClock className="size-3.5 text-ink-4" strokeWidth={1.9} />}
              >
                <div className="space-y-1.5">
                  {data.briefing.events.map((e) => (
                    <div key={e.id} className="flex items-start justify-between gap-2 rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-ink">{e.title}</span>
                          <Badge tone={e.impact === "high" ? "bear" : e.impact === "medium" ? "accent" : "muted"}>
                            {e.impact}
                          </Badge>
                        </div>
                        <div className="text-[9.5px] text-ink-4">
                          {e.currency} · forecast {e.forecast} (prev {e.previous})
                        </div>
                      </div>
                      <span className="tnum shrink-0 text-[10px] text-ink-3">
                        {new Date(e.time).toISOString().slice(11, 16)} UTC
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[9px] leading-relaxed text-ink-4">
                  Reference calendar. Connect a calendar provider to use live release times.
                </p>
              </Panel>

              {/* Usage */}
              {data.usage && data.usage.analysesLimit != null && (
                <Panel title="Plan usage today">
                  <UsageMeter label="AI analyses" used={data.usage.analysesUsedToday} limit={data.usage.analysesLimit} />
                  <UsageMeter label="Scanner runs" used={data.usage.scansUsedToday} limit={data.usage.scansLimit} />
                  <UsageMeter label="Copilot messages" used={data.usage.chatsUsedToday} limit={data.usage.chatsLimit} />
                  <Link
                    href="/app/settings?tab=billing"
                    className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-accent hover:underline"
                  >
                    Compare plans
                    <ArrowRight className="size-2.5" strokeWidth={2.4} />
                  </Link>
                </Panel>
              )}
            </div>
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-ink-4">
            TRADIA AI provides market analysis and educational information and does not guarantee trading
            results. Setups are potential scenarios derived from available market data, not recommendations.
            {data.marketData.source === "demo" && " Prices on this workspace are DEMO DATA (simulated)."}
          </p>
        </>
      ) : (
        <Panel>
          <EmptyState
            icon={<CircleAlert className="size-4" />}
            title="Could not build your briefing"
            description="Market data may be unavailable. Check that the market-data provider is configured, then refresh."
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        </Panel>
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.06em] text-ink-4">{label}</div>
      <div className={cn("tnum text-[11.5px]", tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-ink-2")}>
        {value}
      </div>
    </div>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const remaining = limit != null ? Math.max(0, limit - used) : null;
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-[10.5px]">
        <span className="text-ink-3">{label}</span>
        <span className="tnum text-ink-4">{limit != null ? `${remaining} / ${limit} left` : "Unlimited"}</span>
      </div>
      {limit != null && (
        <ProgressBar
          value={(used / limit) * 100}
          tone={used / limit > 0.85 ? "bear" : used / limit > 0.6 ? "accent" : "bull"}
          className="mt-1"
          height={3}
        />
      )}
    </div>
  );
}
