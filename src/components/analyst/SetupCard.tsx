"use client";

/**
 * The AI setup card — the product's primary artefact.
 *
 * Design intent: a trader should be able to read direction, risk and payoff in
 * under three seconds, then drill into the reasoning if they want it.
 */

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { fmtPrice } from "@/lib/format";
import { Badge, Button, DemoBadge, ProgressBar, QualityBadge } from "@/components/ui";
import { TIMEFRAME_LABEL, type TradeSetup } from "@/lib/types";

export function SetupCard({
  setup,
  onOpenReasoning,
  onPaperTrade,
  onRisk,
  compact,
  source,
}: {
  setup: TradeSetup;
  onOpenReasoning?: () => void;
  onPaperTrade?: () => void;
  onRisk?: () => void;
  compact?: boolean;
  source: "demo" | "live";
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = setup.direction === "long";
  const riskWidth = Math.abs(((setup.stop - setup.entryLow) / setup.entryLow) * 100);

  return (
    <div className="panel overflow-hidden">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-hairline px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-[7px] border",
              isLong ? "border-[#3fae8633] bg-bull-soft text-bull" : "border-[#d2595c33] bg-bear-soft text-bear",
            )}
          >
            {isLong ? <ArrowUpRight className="size-4" strokeWidth={2.2} /> : <ArrowDownRight className="size-4" strokeWidth={2.2} />}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13.5px] font-semibold tracking-[-0.01em]">{setup.symbol}</span>
              <Badge tone={isLong ? "bull" : "bear"}>{isLong ? "Long" : "Short"}</Badge>
              <Badge tone="muted">{TIMEFRAME_LABEL[setup.timeframe]}</Badge>
            </div>
            <div className="mt-0.5 text-[10.5px] text-ink-4">
              {setup.regimeLabel} · ref {fmtPrice(setup.referencePrice, setup.symbol)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <QualityBadge quality={setup.quality} />
          {source === "demo" && <DemoBadge source="demo" />}
        </div>
      </div>

      {/* levels */}
      <div className="grid grid-cols-3 divide-x divide-hairline border-b border-hairline">
        <LevelCell
          label="Entry zone"
          value={`${fmtPrice(setup.entryLow, setup.symbol)}`}
          sub={`– ${fmtPrice(setup.entryHigh, setup.symbol)}`}
        />
        <LevelCell label="Stop loss" value={fmtPrice(setup.stop, setup.symbol)} sub={`−${riskWidth.toFixed(2)}%`} tone="bear" />
        <LevelCell label="Target" value={fmtPrice(setup.takeProfit, setup.symbol)} sub={`${setup.riskReward.toFixed(1)}R`} tone="bull" />
      </div>

      {/* confidence */}
      <div className="px-3.5 py-2.5 border-b border-hairline">
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="text-ink-3">AI-estimated confidence</span>
          <span className="tnum text-ink-2">{setup.confidence}/100</span>
        </div>
        <ProgressBar
          value={setup.confidence}
          tone={setup.quality === "high" ? "accent" : setup.quality === "medium" ? "info" : "bear"}
          className="mt-1.5"
          height={3}
        />
        <p className="mt-1.5 text-[9.5px] leading-snug text-ink-4">
          A measure of confluence across the factors below — not a probability of profit.
        </p>
      </div>

      {/* why (always visible, short) */}
      {!compact && (
        <div className="px-3.5 py-2.5 space-y-1.5">
          {setup.rationale.slice(0, 2).map((r) => (
            <div key={r.label} className="flex gap-2">
              <span className="mt-[5px] size-1 shrink-0 rounded-full bg-ink-4" />
              <p className="text-[11px] leading-relaxed text-ink-2">
                <span className="text-ink-3">{r.label}:</span> {r.detail}
              </p>
            </div>
          ))}
          {expanded &&
            setup.rationale.slice(2).map((r) => (
              <div key={r.label} className="flex gap-2">
                <span className="mt-[5px] size-1 shrink-0 rounded-full bg-ink-4" />
                <p className="text-[11px] leading-relaxed text-ink-2">
                  <span className="text-ink-3">{r.label}:</span> {r.detail}
                </p>
              </div>
            ))}

          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
          >
            {expanded ? "Show less" : "Why this trade?"}
            <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* invalidation */}
      {expanded && (
        <div className="border-t border-hairline bg-surface-2/40 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            <ShieldAlert className="size-3" strokeWidth={2} />
            Invalidated if
          </div>
          <ul className="mt-1.5 space-y-1">
            {setup.invalidatedIf.map((line) => (
              <li key={line} className="flex gap-2 text-[11px] leading-relaxed text-ink-2">
                <span className="mt-[6px] size-1 shrink-0 rounded-full bg-bear/70" />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-ink-3">
            {setup.riskNote}
          </p>
        </div>
      )}

      {/* actions */}
      <div className="flex items-center gap-2 border-t border-hairline px-3.5 py-2.5">
        {onPaperTrade && (
          <Button size="sm" variant="primary" onClick={onPaperTrade} className="flex-1">
            Paper trade
          </Button>
        )}
        {onRisk && (
          <Button size="sm" variant="secondary" onClick={onRisk} className="flex-1">
            Size risk
          </Button>
        )}
        {onOpenReasoning && (
          <Button size="sm" variant="ghost" onClick={onOpenReasoning}>
            Details
          </Button>
        )}
        {compact && (
          <Link
            href={`/app/analyst?symbol=${encodeURIComponent(setup.symbol)}`}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
          >
            Full analysis
            <ChevronRight className="size-3" strokeWidth={2} />
          </Link>
        )}
      </div>
    </div>
  );
}

function LevelCell({
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
    <div className="px-3 py-2.5">
      <div className="text-[9.5px] uppercase tracking-[0.07em] text-ink-4">{label}</div>
      <div
        className={cn(
          "tnum mt-0.5 text-[12.5px] font-medium",
          tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="tnum text-[9.5px] text-ink-4">{sub}</div>
    </div>
  );
}
