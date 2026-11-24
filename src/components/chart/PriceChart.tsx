"use client";

/**
 * Professional but restrained candlestick chart.
 *
 * Rendered as SVG so it stays crisp, themeable and dependency-free, and so a
 * chart can never become a heavyweight client bundle. Supports candles +
 * volume, EMA overlays, support/resistance, and AI setup levels (entry zone,
 * stop, target) drawn as price bands.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtPrice } from "@/lib/format";
import type { Candle, Level, TradeSetup } from "@/lib/types";

export interface ChartOverlay {
  ema20: number[];
  ema50: number[];
}

export function PriceChart({
  symbol,
  candles,
  overlay,
  levels = [],
  setup,
  height = 340,
  showVolume = true,
  className,
}: {
  symbol: string;
  candles: Candle[];
  overlay?: ChartOverlay;
  levels?: Level[];
  setup?: TradeSetup | null;
  height?: number;
  showVolume?: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 800;
  const padL = 8;
  const padR = 66;
  const padT = 12;
  const volH = showVolume ? 46 : 0;
  const plotH = height - padT - volH - 20;
  const plotW = width - padL - padR;

  const view = useMemo(() => {
    const slice = candles.slice(-140);
    if (!slice.length) return null;

    const priceMin = Math.min(...slice.map((c) => c.l));
    const priceMax = Math.max(...slice.map((c) => c.h));

    // Include setup levels in the visible range so nothing is drawn off-canvas.
    const extras: number[] = [];
    if (setup) extras.push(setup.stop, setup.entryLow, setup.entryHigh, setup.takeProfit);
    for (const l of levels.slice(0, 4)) extras.push(l.price);
    const lo = Math.min(priceMin, ...extras);
    const hi = Math.max(priceMax, ...extras);
    const pad = (hi - lo) * 0.06 || hi * 0.004 || 1;
    const min = lo - pad;
    const max = hi + pad;

    const x = (i: number) => padL + (i / Math.max(1, slice.length - 1)) * (plotW - 4);
    const y = (p: number) => padT + ((max - p) / (max - min)) * plotH;

    const vols = slice.map((c) => c.v);
    const maxVol = Math.max(...vols, 1);

    return { slice, min, max, x, y, maxVol, first: slice[0].t, last: slice[slice.length - 1].t };
  }, [candles, setup, levels, plotH, plotW]);

  if (!view) {
    return (
      <div className={cn("flex items-center justify-center rounded-[8px] border border-hairline bg-surface-2", className)} style={{ height }}>
        <span className="text-[11.5px] text-ink-3">No price data available</span>
      </div>
    );
  }

  const { slice, x, y, min, max, maxVol } = view;
  const candleW = Math.max(1.6, Math.min(7, (plotW / slice.length) * 0.62));
  const last = slice[slice.length - 1];
  const hovered = hover != null ? slice[hover] : null;
  const active = hovered ?? last;

  // Horizontal gridlines (5 clean levels)
  const gridPrices = Array.from({ length: 5 }, (_, i) => min + ((max - min) / 4) * i);

  const overlayPath = (series?: number[]) => {
    if (!series || series.length < 2) return null;
    const s = series.slice(-slice.length);
    let d = "";
    let started = false;
    s.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const px = x(i);
      const py = y(v);
      d += `${started ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
      started = true;
    });
    return started ? d : null;
  };

  const ema20Path = overlayPath(overlay?.ema20);
  const ema50Path = overlayPath(overlay?.ema50);

  const setupBand =
    setup && setup.stop > min && setup.stop < max
      ? {
          entryTop: y(setup.entryHigh),
          entryBottom: y(setup.entryLow),
          stop: y(setup.stop),
          target: y(setup.takeProfit),
        }
      : null;

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-start justify-between gap-3 px-1 pb-1.5">
        <div className="flex items-baseline gap-2 tnum">
          <span className="text-[15px] font-medium text-ink">{fmtPrice(active.c, symbol)}</span>
          <span
            className={cn(
              "text-[11px]",
              active.c >= active.o ? "text-bull" : "text-bear",
            )}
          >
            {active.c >= active.o ? "+" : "−"}
            {Math.abs(((active.c - active.o) / active.o) * 100).toFixed(2)}%
          </span>
          <span className="text-[10.5px] text-ink-4">
            {new Date(active.t).toISOString().slice(5, 16).replace("T", " ")} UTC
          </span>
        </div>
        {setup && (
          <div className="flex items-center gap-3 text-[10px] text-ink-3">
            <LegendDot color="bg-accent" label="Entry" />
            <LegendDot color="bg-bear" label="Stop" />
            <LegendDot color="bg-bull" label="Target" />
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`${symbol} candlestick chart`}
        onMouseLeave={() => setHover(null)}
        className="touch-none"
      >
        {/* grid */}
        {gridPrices.map((p, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(p)} y2={y(p)} stroke="#20242b" strokeWidth="1" />
            <text x={width - padR + 6} y={y(p) + 3} fill="#6d7480" fontSize="9.5" fontFamily="ui-monospace, monospace">
              {fmtPrice(p, symbol)}
            </text>
          </g>
        ))}

        {/* setup zones */}
        {setupBand && (
          <g>
            <rect
              x={padL}
              y={Math.min(setupBand.entryTop, setupBand.entryBottom)}
              width={plotW}
              height={Math.max(2, Math.abs(setupBand.entryBottom - setupBand.entryTop))}
              fill="#d9a441"
              opacity="0.13"
            />
            <line x1={padL} x2={width - padR} y1={setupBand.entryTop} y2={setupBand.entryTop} stroke="#d9a441" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
            <line x1={padL} x2={width - padR} y1={setupBand.stop} y2={setupBand.stop} stroke="#d2595c" strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
            <line x1={padL} x2={width - padR} y1={setupBand.target} y2={setupBand.target} stroke="#3fae86" strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
            <text x={padL + 4} y={setupBand.stop - 4} fill="#d2595c" fontSize="9" fontFamily="ui-monospace, monospace">
              SL {fmtPrice(setup!.stop, symbol)}
            </text>
            <text x={padL + 4} y={setupBand.target - 4} fill="#3fae86" fontSize="9" fontFamily="ui-monospace, monospace">
              TP {fmtPrice(setup!.takeProfit, symbol)}
            </text>
          </g>
        )}

        {/* support / resistance */}
        {levels.slice(0, 3).map((l, i) => {
          if (l.price < min || l.price > max) return null;
          return (
            <g key={`lvl-${i}`}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y(l.price)}
                y2={y(l.price)}
                stroke={l.kind === "support" ? "#3fae86" : "#d2595c"}
                strokeWidth="1"
                opacity={0.22 + l.strength * 0.28}
                strokeDasharray="2 4"
              />
            </g>
          );
        })}

        {/* EMAs */}
        {ema20Path && <path d={ema20Path} fill="none" stroke="#6f9fd8" strokeWidth="1.2" opacity="0.75" />}
        {ema50Path && <path d={ema50Path} fill="none" stroke="#d9a441" strokeWidth="1.2" opacity="0.55" />}

        {/* candles */}
        {slice.map((c, i) => {
          const up = c.c >= c.o;
          const color = up ? "#3fae86" : "#d2595c";
          const cx = x(i);
          const top = y(Math.max(c.o, c.c));
          const bot = y(Math.min(c.o, c.c));
          return (
            <g key={c.t}>
              <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1" opacity="0.85" />
              <rect
                x={cx - candleW / 2}
                y={top}
                width={candleW}
                height={Math.max(1, bot - top)}
                fill={color}
                opacity="0.9"
              />
              {showVolume && (
                <rect
                  x={cx - candleW / 2}
                  y={height - 20 - (c.v / maxVol) * volH}
                  width={candleW}
                  height={Math.max(1, (c.v / maxVol) * volH)}
                  fill={color}
                  opacity="0.24"
                />
              )}
            </g>
          );
        })}

        {/* last price marker */}
        <g>
          <line x1={padL} x2={width - padR} y1={y(last.c)} y2={y(last.c)} stroke="#f2f3f5" strokeWidth="0.75" opacity="0.35" strokeDasharray="2 2" />
          <rect x={width - padR + 2} y={y(last.c) - 7} width={padR - 6} height={14} rx="2" fill="#f2f3f5" />
          <text x={width - padR + 6} y={y(last.c) + 3.4} fill="#0a0b0d" fontSize="9.5" fontFamily="ui-monospace, monospace" fontWeight="600">
            {fmtPrice(last.c, symbol)}
          </text>
        </g>

        {/* hover crosshair */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={height - 20} stroke="#6d7480" strokeWidth="0.75" strokeDasharray="2 2" />
          </g>
        )}

        {/* hit areas */}
        {slice.map((c, i) => (
          <rect
            key={`hit-${c.t}`}
            x={x(i) - plotW / slice.length / 2}
            y={padT}
            width={plotW / slice.length}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-1.5 rounded-[1px]", color)} />
      {label}
    </span>
  );
}

/** Sparkline for compact contexts (watchlist rows, cards). */
export function Sparkline({
  values,
  width = 64,
  height = 22,
  tone,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: "bull" | "bear" | "neutral";
  className?: string;
}) {
  if (values.length < 2) return <div style={{ width, height }} className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = tone === "bull" ? "#3fae86" : tone === "bear" ? "#d2595c" : up ? "#3fae86" : "#d2595c";
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
