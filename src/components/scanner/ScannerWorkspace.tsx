"use client";

/**
 * Market Scanner.
 *
 * Ranks the universe through the same analysis pipeline as the AI Analyst.
 * Ranking is confluence-driven: a loud bias with bad reward-to-risk ranks
 * below a quiet one that is actually tradeable for the user's style.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Lock, Radar, RefreshCw, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Alert,
  Badge,
  BiasBadge,
  Button,
  ChoiceGrid,
  DemoBadge,
  EmptyState,
  Panel,
  SectionHeading,
  Segmented,
  Skeleton,
} from "@/components/ui";
import { fmtPrice, fmtTimeAgo } from "@/lib/format";
import { ASSET_CLASS_LABEL } from "@/lib/instruments";
import { RISK_PREFERENCE_LABEL, STYLE_LABEL } from "@/lib/constants";
import type { AssetClass, RiskPreference, ScannedAsset, TradingStyle } from "@/lib/types";

interface ScanResponse {
  rows: ScannedAsset[];
  scanned: number;
  source: "demo" | "live";
  provider: string;
  asOf: number;
  filters: { assetClasses: AssetClass[]; style: TradingStyle; risk: RiskPreference; limit: number };
  usedToday: number;
  limitToday: number | null;
}

const CLASSES: AssetClass[] = ["crypto", "forex", "stocks", "indices", "commodities"];

export function ScannerWorkspace() {
  const { user, usage, refresh, toggleWatch, isWatched } = useSession();
  const [classes, setClasses] = useState<AssetClass[]>(user?.preferences.markets ?? ["crypto"]);
  const [style, setStyle] = useState<TradingStyle>(user?.preferences.style ?? "day");
  const [risk, setRisk] = useState<RiskPreference>(user?.preferences.riskPreference ?? "moderate");
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitInfo, setLimitInfo] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLimitInfo(null);
    try {
      const res = await api.post<ScanResponse>("/api/scan", {
        assetClasses: classes,
        style,
        risk,
      });
      setData(res);
      void refresh();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "PLAN_LIMIT") {
        setLimitInfo(err.message);
      } else {
        setError(err instanceof ApiRequestError ? err.message : "Scan failed.");
      }
    } finally {
      setLoading(false);
    }
  }, [classes, style, risk, refresh]);

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = usage?.analysesLimit != null;
  const rows = data?.rows ?? [];
  const withSetups = rows.filter((r) => r.setup);

  return (
    <div>
      <SectionHeading
        eyebrow="Market Scanner"
        title="Where is the opportunity right now?"
        description="Every instrument in your universe evaluated through the same engine as the AI Analyst, ranked by confluence and fit with your style — not by who is loudest."
        action={
          <Button variant="secondary" size="sm" onClick={() => void scan()} loading={loading}>
            <RefreshCw className="size-3.5" strokeWidth={2} />
            Re-scan
          </Button>
        }
      />

      {/* Filters */}
      <div className="panel mb-3 p-3">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_auto_auto]">
          <div>
            <div className="eyebrow mb-1.5">Markets</div>
            <ChoiceGrid
              options={CLASSES.map((c) => ({ value: c, label: ASSET_CLASS_LABEL[c] }))}
              value={classes}
              onChange={(v) => setClasses(v as AssetClass[])}
              columns={5}
            />
          </div>
          <div>
            <div className="eyebrow mb-1.5">Strategy</div>
            <Segmented
              value={style}
              onChange={(v) => setStyle(v)}
              ariaLabel="Strategy"
              options={(["scalping", "day", "swing"] as TradingStyle[]).map((s) => ({
                value: s,
                label: STYLE_LABEL[s].replace(" trading", ""),
              }))}
            />
          </div>
          <div>
            <div className="eyebrow mb-1.5">Risk appetite</div>
            <Segmented
              value={risk}
              onChange={(v) => setRisk(v)}
              ariaLabel="Risk appetite"
              options={(["conservative", "moderate", "aggressive"] as RiskPreference[]).map((r) => ({
                value: r,
                label: RISK_PREFERENCE_LABEL[r],
              }))}
            />
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5">
          <p className="text-[10.5px] text-ink-4">
            Risk appetite filters by realised volatility. Conservative screens out high-ATR instruments.
          </p>
          <div className="flex items-center gap-2">
            {data && <DemoBadge source={data.source} />}
            <Button variant="primary" size="sm" onClick={() => void scan()} loading={loading}>
              Run scan
            </Button>
          </div>
        </div>
      </div>

      {error && <Alert tone="danger" title="Scanner error">{error}</Alert>}
      {limitInfo && (
        <Alert
          tone="warn"
          title="Daily scanner limit reached"
          action={
            <Link href="/app/settings?tab=billing" className="whitespace-nowrap rounded-[5px] bg-accent px-2 py-1 text-[10.5px] font-semibold text-accent-ink">
              Upgrade
            </Link>
          }
        >
          {limitInfo}
        </Alert>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* Summary strip */}
      {data && !loading && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBlock label="Scanned" value={String(data.scanned)} sub="instruments evaluated" />
          <StatBlock label="Actionable" value={String(withSetups.length)} sub="setups cleared confluence" tone="accent" />
          <StatBlock
            label="Data"
            value={data.source === "demo" ? "Demo" : "Live"}
            sub={data.provider}
          />
          <StatBlock label="Updated" value={fmtTimeAgo(data.asOf)} sub={data.limitToday ? `${Math.max(0, data.limitToday - data.usedToday)} scans left` : "unlimited"} />
        </div>
      )}

      {/* Results */}
      {data && !rows.length && !loading && (
        <Panel>
          <EmptyState
            icon={<Radar className="size-4" />}
            title="Nothing clears the bar"
            description="No instrument in this universe produced a qualifying setup under these filters. Try a wider market selection or a different strategy — or accept that standing aside is correct right now."
          />
        </Panel>
      )}

      {!!rows.length && (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <ScanRow
              key={row.symbol}
              row={row}
              rank={idx + 1}
              watched={isWatched(row.symbol)}
              onWatch={() => void toggleWatch(row.symbol)}
            />
          ))}
        </div>
      )}

      {data && locked && data.rows.length >= (data.limitToday ?? 6) && (
        <div className="mt-3">
          <Panel>
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 size-4 text-accent" strokeWidth={1.9} />
                <div>
                  <div className="text-[12.5px] font-medium text-ink">You&apos;re seeing the top {data.rows.length} results</div>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    Pro ranks the full universe (15 results) with advanced risk-adjusted scoring and unlimited scans.
                  </p>
                </div>
              </div>
              <Link
                href="/app/settings?tab=billing"
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-accent-ink"
              >
                Compare plans
                <ChevronRight className="size-3" strokeWidth={2.2} />
              </Link>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "accent";
}) {
  return (
    <div className="panel-flat px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className={cn("tnum mt-0.5 text-[15px] font-medium", tone === "accent" ? "text-accent" : "text-ink")}>{value}</div>
      <div className="truncate text-[9.5px] text-ink-4">{sub}</div>
    </div>
  );
}

function ScanRow({
  row,
  rank,
  watched,
  onWatch,
}: {
  row: ScannedAsset;
  rank: number;
  watched: boolean;
  onWatch: () => void;
}) {
  const setup = row.setup;
  const isLong = setup?.direction === "long";

  return (
    <div className="panel group px-3 py-2.5 transition-colors hover:border-hairline-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="tnum w-5 shrink-0 text-[11px] text-ink-4">{String(rank).padStart(2, "0")}</span>

        <div className="flex min-w-[130px] flex-1 items-center gap-2">
          <button onClick={onWatch} aria-label={watched ? `Unwatch ${row.symbol}` : `Watch ${row.symbol}`} className="shrink-0 p-0.5">
            <Star
              className={cn("size-3.5", watched ? "text-accent" : "text-ink-4 hover:text-ink-2")}
              strokeWidth={2}
              fill={watched ? "currentColor" : "none"}
            />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-medium text-ink">{row.symbol}</span>
              <span className="text-[9.5px] text-ink-4">{ASSET_CLASS_LABEL[row.assetClass]}</span>
            </div>
            <div className="tnum text-[10px] text-ink-4">
              {fmtPrice(row.price, row.symbol)} · ATR {row.volatilityPct.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="w-[92px] shrink-0">
          <BiasBadge bias={row.bias} />
        </div>

        <div className="hidden w-[120px] shrink-0 sm:block">
          <div className="text-[10px] text-ink-4">Regime</div>
          <div className="truncate text-[11px] text-ink-2">{regimeLabel(row.regime)}</div>
        </div>

        {/* setup summary */}
        <div className="min-w-0 flex-1 sm:min-w-[220px]">
          {setup ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-[3px] border px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em]",
                  isLong ? "border-[#3fae8633] bg-bull-soft text-bull" : "border-[#d2595c33] bg-bear-soft text-bear",
                )}
              >
                {isLong ? <ArrowUpRight className="size-2.5" strokeWidth={2.6} /> : <ArrowDownRight className="size-2.5" strokeWidth={2.6} />}
                {setup.direction}
              </span>
              <Badge tone={setup.quality === "high" ? "accent" : setup.quality === "medium" ? "info" : "muted"}>
                {setup.quality}
              </Badge>
              <span className="tnum text-[10.5px] text-ink-3">
                {setup.timeframe.toUpperCase()} · {setup.riskReward.toFixed(1)}:1
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-ink-4">No qualifying setup</span>
          )}
        </div>

        {/* score */}
        <div className="hidden w-14 shrink-0 text-right sm:block">
          <div className="tnum text-[13px] font-medium text-ink">{row.score}</div>
          <div className="text-[9px] uppercase tracking-wide text-ink-4">rank</div>
        </div>

        <Link
          href={`/app/analyst?symbol=${encodeURIComponent(row.symbol)}`}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-[5px] border border-hairline-2 px-2 py-1 text-[10.5px] text-ink-2 transition-colors hover:border-[#3a4049] hover:text-ink"
        >
          Analyze
          <ChevronRight className="size-2.5" strokeWidth={2.4} />
        </Link>
      </div>

      {setup && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline pt-1.5 pl-8 text-[10px] text-ink-3">
          <span>
            Entry <span className="tnum text-ink-2">{fmtPrice(setup.entryLow, row.symbol)}–{fmtPrice(setup.entryHigh, row.symbol)}</span>
          </span>
          <span>
            Stop <span className="tnum text-bear">{fmtPrice(setup.stop, row.symbol)}</span>
          </span>
          <span>
            Target <span className="tnum text-bull">{fmtPrice(setup.takeProfit, row.symbol)}</span>
          </span>
          <span className="text-ink-4">Confidence {setup.confidence}/100</span>
          <span className="hidden truncate text-ink-4 lg:inline">{row.headline}</span>
        </div>
      )}
    </div>
  );
}

function regimeLabel(regime: ScannedAsset["regime"]): string {
  return regime
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
