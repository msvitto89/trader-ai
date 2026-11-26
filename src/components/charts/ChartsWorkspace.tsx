"use client";

/**
 * Charts.
 *
 * Deliberately restrained: candles, volume, two EMAs, mapped levels and any
 * AI setup levels passed in from a link. Indicator overlays are switchable so
 * the chart stays clean by default.
 */

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Lock, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Button,
  DemoBadge,
  Panel,
  SectionHeading,
  Select,
  Skeleton,
} from "@/components/ui";
import { PriceChart } from "@/components/chart/PriceChart";
import { fmtNum, fmtPrice } from "@/lib/format";
import { INSTRUMENTS, getInstrument } from "@/lib/instruments";
import { TIMEFRAMES, TIMEFRAME_LABEL, type Candle, type Level, type Timeframe, type TradeSetup } from "@/lib/types";

interface SeriesResponse {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  indicators: {
    ema20: number;
    ema50: number;
    rsi14: number;
    macd: { histogram: number };
    atrPct: number;
    adx: number;
    bb: { upper: number; lower: number; widthPct: number };
  };
  levels: Level[];
  source: "demo" | "live";
  asOf: number;
}

export function ChartsWorkspace() {
  const params = useSearchParams();
  const { user, usage, toggleWatch, isWatched } = useSession();

  const [symbol, setSymbol] = useState(params.get("symbol") ?? user?.watchlist[0] ?? "BTC/USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [data, setData] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  const setup: TradeSetup | null = useMemo(() => {
    const entry = params.get("entry");
    const stop = params.get("stop");
    const tp = params.get("tp");
    const dir = params.get("dir");
    if (!entry || !stop || !tp || !dir) return null;
    const entryN = Number(entry);
    return {
      id: "link-preview",
      symbol,
      assetClass: getInstrument(symbol)?.assetClass ?? "crypto",
      direction: dir === "short" ? "short" : "long",
      timeframe,
      style: "day",
      entryLow: entryN * 0.999,
      entryHigh: entryN * 1.001,
      stop: Number(stop),
      takeProfit: Number(tp),
      riskReward: Math.abs(Number(tp) - entryN) / Math.max(1e-9, Math.abs(entryN - Number(stop))),
      quality: "medium",
      regime: "ranging",
      regimeLabel: "From link",
      confidence: 0,
      score: 0,
      rationale: [],
      invalidatedIf: [],
      riskNote: "",
      createdAt: Date.now(),
      referencePrice: entryN,
      demo: true,
      status: "open",
    };
  }, [params, symbol, timeframe]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<SeriesResponse>(`/api/market/series?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=200`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  const overlay = useMemo(() => {
    if (!data) return undefined;
    const closes = data.candles.map((c) => c.c);
    const ema = (period: number) => {
      const out: number[] = new Array(closes.length).fill(NaN);
      if (closes.length < period) return out;
      const k = 2 / (period + 1);
      let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out[period - 1] = prev;
      for (let i = period; i < closes.length; i++) {
        prev = closes[i] * k + prev * (1 - k);
        out[i] = prev;
      }
      return out;
    };
    return { ema20: ema(20), ema50: ema(50) };
  }, [data]);

  const ind = data?.indicators;
  const depth = usage?.analysesLimit != null ? 4 : 7;

  return (
    <div>
      <SectionHeading
        eyebrow="Charts"
        title="Price action with AI levels"
        description="Candles, volume, trend EMAs and mapped levels. When a setup comes from the AI Analyst, its entry zone, stop and target are drawn here."
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isWatched(symbol) ? "secondary" : "ghost"}
              onClick={() => void toggleWatch(symbol)}
            >
              <Star
                strokeWidth={2}
                fill={isWatched(symbol) ? "currentColor" : "none"}
                className={cn("size-3.5", isWatched(symbol) && "text-accent")}
              />
              {isWatched(symbol) ? "Watching" : "Watch"}
            </Button>
          </div>
        }
      />

      <div className="panel mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-auto min-w-[140px]">
            {INSTRUMENTS.map((i) => (
              <option key={i.symbol} value={i.symbol}>
                {i.symbol}
              </option>
            ))}
          </Select>

          <div className="flex flex-wrap items-center gap-0.5">
            {TIMEFRAMES.map((tf, idx) => {
              const locked = idx >= depth;
              return (
                <button
                  key={tf}
                  disabled={locked}
                  onClick={() => setTimeframe(tf)}
                  title={locked ? "Available on Pro" : undefined}
                  className={cn(
                    "flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-[11px]",
                    timeframe === tf ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
                    locked && "cursor-not-allowed opacity-40",
                  )}
                >
                  {TIMEFRAME_LABEL[tf]}
                  {locked && <Lock className="size-2.5" strokeWidth={2} />}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <ToggleChip active={showEma} onClick={() => setShowEma((v) => !v)} label="EMA" />
            <ToggleChip active={showLevels} onClick={() => setShowLevels((v) => !v)} label="Levels" />
            <ToggleChip active={showVolume} onClick={() => setShowVolume((v) => !v)} label="Volume" />
            {data && <DemoBadge source={data.source} />}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_248px]">
        <Panel
          dense
          title={`${symbol} · ${TIMEFRAME_LABEL[timeframe]}`}
          subtitle={data ? `${data.candles.length} bars · last ${new Date(data.asOf).toISOString().slice(0, 16).replace("T", " ")} UTC` : "Loading…"}
        >
          <div className="px-2 pb-2">
            {loading || !data ? (
              <Skeleton className="h-[420px] w-full" />
            ) : (
              <PriceChart
                symbol={symbol}
                candles={data.candles}
                overlay={showEma ? overlay : undefined}
                levels={showLevels ? data.levels : []}
                setup={setup}
                showVolume={showVolume}
                height={420}
              />
            )}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Readings">
            {ind ? (
              <div className="space-y-0.5">
                <Row label="RSI 14" value={fmtNum(ind.rsi14, 1)} tone={ind.rsi14 > 70 ? "bear" : ind.rsi14 < 30 ? "bull" : undefined} />
                <Row label="ADX 14" value={fmtNum(ind.adx, 1)} />
                <Row label="MACD" value={fmtNum(ind.macd.histogram, 2)} tone={ind.macd.histogram > 0 ? "bull" : "bear"} />
                <Row label="ATR %" value={`${ind.atrPct.toFixed(2)}%`} />
                <Row label="EMA 20" value={fmtPrice(ind.ema20, symbol)} />
                <Row label="EMA 50" value={fmtPrice(ind.ema50, symbol)} />
                <Row label="BB width" value={`${ind.bb.widthPct.toFixed(2)}%`} />
              </div>
            ) : (
              <Skeleton className="h-40" />
            )}
          </Panel>

          <Panel title="Levels" subtitle="Swing pivots, clustered by strength">
            {data?.levels.length ? (
              <div className="space-y-1">
                {data.levels.slice(0, 6).map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("size-1.5 rounded-full", l.kind === "support" ? "bg-bull" : "bg-bear")} />
                      <span className="tnum text-[11.5px] text-ink-2">{fmtPrice(l.price, symbol)}</span>
                    </span>
                    <span className="text-[9.5px] text-ink-4">
                      {l.touches}× · {(l.strength * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-ink-4">No clear pivots mapped.</p>
            )}
          </Panel>

          {setup && (
            <Panel title="AI setup levels" subtitle="From the link you followed">
              <div className="space-y-0.5">
                <Row label="Entry zone" value={`${fmtPrice(setup.entryLow, symbol)}–${fmtPrice(setup.entryHigh, symbol)}`} />
                <Row label="Stop" value={fmtPrice(setup.stop, symbol)} tone="bear" />
                <Row label="Target" value={fmtPrice(setup.takeProfit, symbol)} tone="bull" />
                <Row label="R / R" value={`${setup.riskReward.toFixed(2)}:1`} />
              </div>
            </Panel>
          )}

          <Panel title="Chart notes">
            <p className="text-[10.5px] leading-relaxed text-ink-4">
              Levels are swing pivots clustered within 0.6×ATR. EMAs are 20 and 50 period. {data?.source === "demo" && "Prices are DEMO DATA — simulated for evaluation, not live quotes."}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ToggleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-[10.5px] transition-colors",
        active ? "bg-surface-3 text-ink" : "text-ink-4 hover:text-ink-3",
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-accent" : "bg-ink-4")} />
      {label}
    </button>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#1a1e24] py-1.5 last:border-0">
      <span className="text-[10.5px] text-ink-3">{label}</span>
      <span className={cn("tnum text-[11.5px]", tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-ink-2")}>
        {value}
      </span>
    </div>
  );
}
