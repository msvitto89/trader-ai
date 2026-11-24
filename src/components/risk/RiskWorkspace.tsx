"use client";

/**
 * Risk Manager.
 *
 * Answers one question extremely well: given a stop, how big can this position
 * be before it stops being a bad idea? Everything recalculates live on input —
 * the round-trip to the server is for validation and the portfolio-heat check,
 * not for arithmetic.
 */

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Shield, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Alert,
  Button,
  Field,
  LinkButton,
  NumericInput,
  Panel,
  ProgressBar,
  SectionHeading,
  Segmented,
  Select,
  StatRow,
  useToast,
} from "@/components/ui";
import { fmtMoney, fmtPct, fmtPrice, fmtQty } from "@/lib/format";
import { INSTRUMENTS, getInstrument } from "@/lib/instruments";
import type { Position, RiskResult } from "@/lib/types";

export function RiskWorkspace() {
  const params = useSearchParams();
  const { user, refresh } = useSession();
  const { push: toast } = useToast();

  const prefSymbol = params.get("symbol") ?? user?.watchlist[0] ?? "BTC/USD";
  const initialDir = (params.get("dir") === "short" ? "short" : "long") as "long" | "short";

  const [symbol, setSymbol] = useState(prefSymbol);
  const [direction, setDirection] = useState<"long" | "short">(initialDir);
  const [balance, setBalance] = useState(String(user?.preferences.defaultBalance ?? 10000));
  const [riskPct, setRiskPct] = useState(String(user?.preferences.defaultRiskPct ?? 1));
  const [entry, setEntry] = useState(params.get("entry") ?? "");
  const [stop, setStop] = useState(params.get("stop") ?? "");
  const [tp, setTp] = useState(params.get("tp") ?? "");
  const [leverage, setLeverage] = useState("");
  const [result, setResult] = useState<RiskResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [busy, setBusy] = useState(false);

  const inst = getInstrument(symbol);
  const precision = inst?.precision ?? 2;

  /* Load mark price + open exposure */
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ quotes: { symbol: string; price: number }[] }>(`/api/market/quote?symbols=${encodeURIComponent(symbol)}`).catch(() => null),
      api.get<{ positions: Position[] }>("/api/paper").catch(() => null),
    ]).then(([q, p]) => {
      if (cancelled) return;
      const quote = q?.quotes.find((x) => x.symbol === symbol);
      if (quote) {
        setPrice(quote.price);
        // Prefill entry with the mark so the calculator is immediately usable.
        setEntry((prev) => prev || quote.price.toFixed(precision + 1));
        setStop((prev) => {
          if (prev) return prev;
          const offset = direction === "long" ? 0.985 : 1.015;
          return (quote.price * offset).toFixed(precision + 1);
        });
        setTp((prev) => {
          if (prev) return prev;
          const offset = direction === "long" ? 1.03 : 0.97;
          return (quote.price * offset).toFixed(precision + 1);
        });
      }
      if (p) setOpenPositions(p.positions.filter((x) => x.closedAt == null));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, direction]);

  const openRisk = useMemo(() => {
    return openPositions.reduce((acc, p) => {
      if (p.stop == null) return acc;
      return acc + Math.abs(p.entry - p.stop) * p.size;
    }, 0);
  }, [openPositions]);

  const calculate = useCallback(async () => {
    setServerError(null);
    if (!entry || !stop || !tp) {
      setResult(null);
      return;
    }
    try {
      const res = await api.post<{ result: RiskResult }>("/api/risk", {
        symbol,
        balance: Number(balance),
        riskPct: Number(riskPct),
        entry: Number(entry),
        stop: Number(stop),
        takeProfit: Number(tp),
        direction,
        leverage: leverage ? Number(leverage) : undefined,
        openExposure: openRisk,
      });
      setResult(res.result);
    } catch (err) {
      setResult(null);
      setServerError(err instanceof ApiRequestError ? err.message : "Could not calculate.");
    }
  }, [symbol, balance, riskPct, entry, stop, tp, direction, leverage, openRisk]);

  useEffect(() => {
    const t = setTimeout(() => void calculate(), 220);
    return () => clearTimeout(t);
  }, [calculate]);

  // Quick risk presets relative to the entry
  const applyStopPct = (pct: number) => {
    const e = Number(entry);
    if (!e) return;
    const s = direction === "long" ? e * (1 - pct / 100) : e * (1 + pct / 100);
    const t = direction === "long" ? e * (1 + (pct * 2) / 100) : e * (1 - (pct * 2) / 100);
    setStop(s.toFixed(precision + 1));
    setTp(t.toFixed(precision + 1));
  };

  const openPaper = async () => {
    if (!result?.valid) return;
    setBusy(true);
    try {
      await api.post("/api/paper", {
        symbol,
        direction,
        size: result.positionSize,
        entry: Number(entry),
        stop: Number(stop),
        takeProfit: Number(tp),
        notes: "Sized in Risk Manager",
      });
      void refresh();
      toast(`${symbol} paper position opened at ${fmtQty(result.positionSize, symbol)}`);
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.message : "Could not open position", "error");
    } finally {
      setBusy(false);
    }
  };

  const heatPct = result?.valid
    ? ((openRisk + result.maxRiskAmount) / Math.max(1, Number(balance))) * 100
    : (openRisk / Math.max(1, Number(balance))) * 100;

  return (
    <div>
      <SectionHeading
        eyebrow="Risk Manager"
        title="Size the trade before you take it"
        description="Enter your levels and the calculator returns position size, dollar risk, reward-to-risk and portfolio heat. If the stop is hit, you know the exact cost."
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_1.05fr]">
        {/* ── Inputs ────────────────────────────────────────── */}
        <div className="space-y-3">
          <Panel title="Trade parameters">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Instrument">
                  <Select
                    value={symbol}
                    onChange={(e) => {
                      setSymbol(e.target.value);
                      setEntry("");
                      setStop("");
                      setTp("");
                    }}
                  >
                    {INSTRUMENTS.map((i) => (
                      <option key={i.symbol} value={i.symbol}>
                        {i.symbol}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Direction">
                  <Segmented
                    className="w-full [&>button]:flex-1"
                    value={direction}
                    onChange={(v) => setDirection(v)}
                    options={[
                      { value: "long" as const, label: "Long" },
                      { value: "short" as const, label: "Short" },
                    ]}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Account balance" suffix="USD">
                  <NumericInput value={balance} onValueChange={setBalance} />
                </Field>
                <Field label="Risk per trade" suffix="% of equity">
                  <NumericInput value={riskPct} onValueChange={setRiskPct} />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.07em] text-ink-4">Quick risk</span>
                {[0.5, 1, 1.5, 2].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRiskPct(String(r))}
                    className={cn(
                      "rounded-[4px] px-1.5 py-0.5 text-[10.5px] tnum",
                      Math.abs(Number(riskPct) - r) < 0.001 ? "bg-accent-soft text-accent" : "text-ink-3 hover:text-ink-2",
                    )}
                  >
                    {r}%
                  </button>
                ))}
              </div>

              <div className="hairline-x pt-3">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Entry" suffix={price ? `mark ${fmtPrice(price, symbol)}` : undefined}>
                    <NumericInput value={entry} onValueChange={setEntry} />
                  </Field>
                  <Field label="Stop loss">
                    <NumericInput value={stop} onValueChange={setStop} />
                  </Field>
                  <Field label="Take profit">
                    <NumericInput value={tp} onValueChange={setTp} />
                  </Field>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-[0.07em] text-ink-4">Stop distance</span>
                  {[0.5, 1, 2, 3].map((p) => (
                    <button
                      key={p}
                      onClick={() => applyStopPct(p)}
                      disabled={!entry}
                      className="rounded-[4px] px-1.5 py-0.5 text-[10.5px] text-ink-3 hover:bg-surface-2 hover:text-ink-2 disabled:opacity-40"
                    >
                      {p}%
                    </button>
                  ))}
                  <span className="ml-auto text-[9.5px] text-ink-4">sets stop & 2R target</span>
                </div>
              </div>

              <Field label="Leverage (optional)" hint="Leave empty for spot / unleveraged sizing.">
                <NumericInput value={leverage} onValueChange={setLeverage} placeholder="e.g. 5" />
              </Field>
            </div>
          </Panel>

          {/* Portfolio heat */}
          <Panel title="Portfolio heat" subtitle="Total risk currently at stake">
            <div className="flex items-baseline justify-between">
              <span className="tnum text-[22px] font-medium">{heatPct.toFixed(2)}%</span>
              <span className={cn("text-[10.5px]", heatPct > 6 ? "text-bear" : heatPct > 3 ? "text-accent" : "text-bull")}>
                {heatPct > 6 ? "Above guideline" : heatPct > 3 ? "Elevated" : "Healthy"}
              </span>
            </div>
            <ProgressBar value={Math.min(100, (heatPct / 10) * 100)} tone={heatPct > 6 ? "bear" : heatPct > 3 ? "accent" : "bull"} className="mt-2" />
            <div className="mt-1 flex justify-between text-[9.5px] text-ink-4">
              <span>0%</span>
              <span>6% guideline</span>
              <span>10%+</span>
            </div>
            <div className="mt-2.5 space-y-0.5">
              <StatRow label="Open positions" value={String(openPositions.length)} />
              <StatRow label="Existing risk at stop" value={fmtMoney(openRisk)} tone={openRisk > 0 ? "bear" : "muted"} />
              <StatRow label="This trade adds" value={result?.valid ? fmtMoney(result.maxRiskAmount) : "—"} tone="bear" />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-4">
              The 6% guideline is a common ceiling for simultaneous open risk. It is a convention, not a rule —
              but exceeding it turns several small decisions into one large one.
            </p>
          </Panel>
        </div>

        {/* ── Results ───────────────────────────────────────── */}
        <div className="space-y-3">
          {serverError && <Alert tone="danger">{serverError}</Alert>}

          {result && !result.valid && (
            <Panel title="Cannot size this trade">
              <div className="space-y-1.5">
                {result.errors.map((e) => (
                  <div key={e} className="flex gap-2 rounded-[6px] border border-[#d2595c33] bg-bear-soft px-2.5 py-2">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-bear" strokeWidth={2} />
                    <span className="text-[11px] leading-relaxed text-[#e9a3a4]">{e}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {result?.valid && (
            <>
              <div className="panel overflow-hidden">
                <div className="border-b border-hairline px-3.5 py-2.5">
                  <div className="eyebrow">Position size</div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="tnum text-[26px] font-semibold tracking-[-0.02em]">{fmtQty(result.positionSize, symbol)}</span>
                    <span className="text-[11px] text-ink-3">notional {fmtMoney(result.notional)}</span>
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-ink-4">
                    Max risk {fmtMoney(result.maxRiskAmount)} = {riskPct}% of {fmtMoney(Number(balance))}
                  </p>
                </div>

                <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
                  <Cell label="Stop distance" value={fmtPrice(result.stopDistance, symbol)} sub={fmtPct(result.stopDistancePct)} />
                  <Cell label="Reward / risk" value={`${result.riskReward.toFixed(2)}:1`} sub={result.riskReward >= 2 ? "favourable" : result.riskReward >= 1 ? "acceptable" : "thin"} tone={result.riskReward >= 2 ? "bull" : result.riskReward < 1 ? "bear" : undefined} />
                  <Cell label="Potential loss" value={fmtMoney(result.potentialLoss)} sub="if stop is hit" tone="bear" />
                  <Cell label="Potential profit" value={fmtMoney(result.potentialProfit)} sub="if target is hit" tone="bull" />
                </div>
              </div>

              {/* Visual risk/reward */}
              <Panel title="If you are wrong / if you are right">
                <div className="space-y-2.5">
                  <div>
                    <div className="mb-1 flex items-baseline justify-between text-[11px]">
                      <span className="text-ink-3">Loss at stop</span>
                      <span className="tnum text-bear">−{fmtMoney(result.potentialLoss)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-bear" style={{ width: `${(result.potentialLoss / Math.max(result.potentialLoss, result.potentialProfit)) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-baseline justify-between text-[11px]">
                      <span className="text-ink-3">Gain at target</span>
                      <span className="tnum text-bull">+{fmtMoney(result.potentialProfit)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-bull" style={{ width: `${(result.potentialProfit / Math.max(result.potentialLoss, result.potentialProfit)) * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-2">
                    <div className="text-[9.5px] uppercase tracking-[0.07em] text-ink-4">Break-even win rate</div>
                    <div className="tnum mt-0.5 text-[13px] text-ink">
                      {(100 / (1 + result.riskReward)).toFixed(1)}%
                    </div>
                    <p className="mt-0.5 text-[9.5px] leading-snug text-ink-4">
                      The hit rate you need at this payoff to break even, before costs.
                    </p>
                  </div>
                  <div className="rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-2">
                    <div className="text-[9.5px] uppercase tracking-[0.07em] text-ink-4">Margin required</div>
                    <div className="tnum mt-0.5 text-[13px] text-ink">
                      {result.marginRequired != null ? fmtMoney(result.marginRequired) : "—"}
                    </div>
                    <p className="mt-0.5 text-[9.5px] leading-snug text-ink-4">
                      {result.marginRequired != null ? `At ${leverage}:1 leverage` : "No leverage specified (spot sizing)"}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 border-t border-hairline pt-2">
                  <StatRow label="Exposure vs equity" value={`${result.exposurePct.toFixed(0)}%`} />
                  <StatRow label="Stop distance" value={`${result.stopDistancePct.toFixed(3)}%`} />
                  <StatRow label="Spread cost (est.)" value={`${result.breakEvenMove.toFixed(3)}%`} />
                </div>
              </Panel>

              {result.warnings.length > 0 && (
                <Panel title="Warnings">
                  <div className="space-y-1.5">
                    {result.warnings.map((w) => (
                      <div key={w} className="flex gap-2 rounded-[6px] border border-[#d7efff33] bg-accent-soft px-2.5 py-2">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={2} />
                        <span className="text-[11px] leading-relaxed text-[#e6c894]">{w}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="md" onClick={openPaper} loading={busy} className="flex-1">
                  <Shield className="size-3.5" strokeWidth={2} />
                  Open as paper trade
                </Button>
                <LinkButton
                  href={`/app/charts?symbol=${encodeURIComponent(symbol)}&entry=${entry}&stop=${stop}&tp=${tp}&dir=${direction}`}
                  variant="secondary"
                  size="md"
                >
                  View on chart
                  <ArrowRight className="size-3.5" strokeWidth={2} />
                </LinkButton>
              </div>

              <p className="text-[10px] leading-relaxed text-ink-4">
                Sizing assumes the stop fills at your level. Gaps and fast markets produce slippage, making the
                realised loss larger. Position size is a limit, not a prediction.
              </p>
            </>
          )}

          {!result && !serverError && (
            <Panel>
              <div className="py-10 text-center">
                <div className="mx-auto mb-3 flex size-9 items-center justify-center rounded-[8px] border border-hairline-2 bg-surface-2">
                  <Shield className="size-4 text-ink-3" strokeWidth={1.8} />
                </div>
                <h3 className="text-[12.5px] font-medium text-ink">Enter your levels</h3>
                <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-ink-3">
                  The calculator needs an entry, a stop and a target. A trade without a stop cannot be sized —
                  that is the point.
                </p>
              </div>
            </Panel>
          )}

          {/* Formula transparency */}
          <Panel title="How this is calculated">
            <div className="space-y-1.5 font-mono text-[10.5px] leading-relaxed text-ink-3">
              <div>max_risk = balance × risk%</div>
              <div>position_size = max_risk ÷ |entry − stop|</div>
              <div>notional = position_size × entry</div>
              <div>risk_reward = |target − entry| ÷ |entry − stop|</div>
              <div>heat = (open_risk + max_risk) ÷ balance</div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-4">
              No hidden multipliers or “smart” adjustments — you can reproduce every number on this screen by hand.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Cell({
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
      <div className={cn("tnum mt-0.5 text-[13px] font-medium", tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-ink")}>
        {value}
      </div>
      <div className="text-[9.5px] text-ink-4">{sub}</div>
    </div>
  );
}
