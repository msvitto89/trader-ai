"use client";

/**
 * Trading Journal.
 *
 * Recording is deliberately low-friction; the value is in the analysis that
 * comes back. Insights refuse to generalise below a minimum sample size and
 * every observation carries the n it came from.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  CircleAlert,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Modal,
  NumericInput,
  Panel,
  SectionHeading,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { fmtDate, fmtMoney, fmtPrice } from "@/lib/format";
import { INSTRUMENTS } from "@/lib/instruments";
import { STYLE_LABEL } from "@/lib/constants";
import type { JournalEntry, JournalInsight } from "@/lib/types";

interface JournalResponse {
  entries: JournalEntry[];
  insights: JournalInsight[];
  scorecard: { label: string; value: string; hint: string; tone: "good" | "warn" | "bad" | "muted" }[];
  insightsLocked: boolean;
}

export function JournalWorkspace() {
  const { usage } = useSession();
  const { push: toast } = useToast();
  const [data, setData] = useState<JournalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<JournalResponse>("/api/journal"));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not load your journal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = data?.entries ?? [];

  const remove = async (id: string) => {
    await api.del("/api/journal", { id }).catch(() => {});
    await load();
    toast("Entry deleted");
  };

  return (
    <div>
      <SectionHeading
        eyebrow="Trading Journal"
        title="What does your own history say?"
        description="Record closed trades and the AI reviews them for patterns you can act on — style edge, payoff asymmetry, entry timing, loss clustering."
        action={
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" strokeWidth={2.4} />
            Log a trade
          </Button>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {loading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          {/* Scorecard */}
          <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {(data?.scorecard ?? []).map((s) => (
              <div key={s.label} className="panel-flat px-3 py-2">
                <div className="eyebrow">{s.label}</div>
                <div
                  className={cn(
                    "tnum mt-0.5 text-[16px] font-medium",
                    s.tone === "good" ? "text-bull" : s.tone === "warn" ? "text-accent" : s.tone === "bad" ? "text-bear" : "text-ink-3",
                  )}
                >
                  {s.value}
                </div>
                <div className="text-[9.5px] leading-snug text-ink-4">{s.hint}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
            {/* Entries */}
            <div className="space-y-3 lg:order-1">
              <Panel
                dense
                title="Recorded trades"
                subtitle={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
              >
                {entries.length === 0 ? (
                  <EmptyState
                    icon={<BookOpen className="size-4" />}
                    title="Your journal is empty"
                    description="Log a closed trade — or close a paper position and copy it across in one click. The AI needs real entries; it will not invent patterns from nothing."
                    action={
                      <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                        Log your first trade
                      </Button>
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table w-full">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Asset</th>
                          <th>Side</th>
                          <th className="text-right">Entry</th>
                          <th className="text-right">Exit</th>
                          <th className="text-right">P&L</th>
                          <th className="text-right">R</th>
                          <th>Strategy</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id}>
                            <td className="text-ink-4">{fmtDate(e.closedAt)}</td>
                            <td className="font-medium text-ink">{e.symbol}</td>
                            <td>
                              <span className={cn("inline-flex items-center gap-0.5 text-[10.5px] uppercase", e.direction === "long" ? "text-bull" : "text-bear")}>
                                {e.direction === "long" ? <ArrowUpRight className="size-3" strokeWidth={2.4} /> : <ArrowDownRight className="size-3" strokeWidth={2.4} />}
                                {e.direction}
                              </span>
                            </td>
                            <td className="tnum text-right text-ink-2">{fmtPrice(e.entry, e.symbol)}</td>
                            <td className="tnum text-right text-ink-2">{fmtPrice(e.exit, e.symbol)}</td>
                            <td className={cn("tnum text-right font-medium", e.pnl >= 0 ? "text-bull" : "text-bear")}>
                              {fmtMoney(e.pnl, { sign: true })}
                            </td>
                            <td className={cn("tnum text-right", (e.rMultiple ?? 0) >= 0 ? "text-bull" : "text-bear")}>
                              {e.rMultiple != null ? `${e.rMultiple.toFixed(2)}R` : "—"}
                            </td>
                            <td className="text-ink-3">{STYLE_LABEL[e.strategy] ?? e.strategy}</td>
                            <td>
                              <button onClick={() => void remove(e.id)} className="p-1 text-ink-4 hover:text-bear" aria-label="Delete entry">
                                <Trash2 className="size-3" strokeWidth={1.8} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {entries.some((e) => e.notes) && (
                <Panel title="Notes">
                  <div className="space-y-2">
                    {entries
                      .filter((e) => e.notes)
                      .slice(0, 5)
                      .map((e) => (
                        <div key={e.id} className="rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-ink">
                              {e.symbol} · {e.symbol === e.symbol ? STYLE_LABEL[e.strategy] ?? e.strategy : ""}
                            </span>
                            <span className={cn("tnum text-[10.5px]", e.pnl >= 0 ? "text-bull" : "text-bear")}>
                              {fmtMoney(e.pnl, { sign: true })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-3">{e.notes}</p>
                        </div>
                      ))}
                  </div>
                </Panel>
              )}
            </div>

            {/* AI insights */}
            <div className="space-y-3 lg:order-2">
              <Panel
                title="AI journal analysis"
                subtitle="Based only on the trades you recorded"
                action={<Brain className="size-3.5 text-accent" strokeWidth={1.9} />}
              >
                {data?.insightsLocked ? (
                  <div className="py-4 text-center">
                    <Lock className="mx-auto mb-2 size-4 text-accent" strokeWidth={1.9} />
                    <h3 className="text-[12.5px] font-medium text-ink">Advanced journal analytics</h3>
                    <p className="mx-auto mt-1 max-w-[15rem] text-[11px] leading-relaxed text-ink-3">
                      Pro analyses style edge, entry timing, loss clustering and payoff asymmetry across your
                      full history.
                    </p>
                    <a
                      href="/app/settings?tab=billing"
                      className="mt-3 inline-flex rounded-[6px] bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-accent-ink"
                    >
                      Compare plans
                    </a>
                  </div>
                ) : data?.insights.length ? (
                  <div className="space-y-2">
                    {data.insights.map((ins) => (
                      <div
                        key={ins.id}
                        className={cn(
                          "rounded-[7px] border px-2.5 py-2",
                          ins.severity === "positive"
                            ? "border-[#3fae8633] bg-bull-soft"
                            : ins.severity === "risk"
                              ? "border-[#d2595c33] bg-bear-soft"
                              : "border-hairline bg-surface-2",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11.5px] font-medium text-ink">{ins.title}</span>
                          {ins.metric && (
                            <span className="shrink-0 tnum text-[9.5px] text-ink-4">{ins.metric}</span>
                          )}
                        </div>
                        <p className="mt-1 text-[10.5px] leading-relaxed text-ink-2">{ins.detail}</p>
                        <p className="mt-1 text-[9px] text-ink-4">n = {ins.sampleSize} trades</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<CircleAlert className="size-4" />}
                    title="Not enough data yet"
                    description="Log at least eight trades and the analysis becomes meaningful. Fewer than that and any pattern is noise."
                  />
                )}
              </Panel>

              <Panel title="Why this matters">
                <p className="text-[11px] leading-relaxed text-ink-3">
                  Most traders lose money on execution, not ideas. Journal analysis isolates the execution
                  leak — payoff ratio, entry timing, loss clustering — so the fix is specific rather than
                  “be more disciplined”.
                </p>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-4">
                  Insights are statistical observations about your own record, not advice. Small samples
                  produce confident-sounding nonsense, which is why the minimum is enforced.
                </p>
              </Panel>
            </div>
          </div>
        </>
      )}

      <AddEntryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={async () => {
          await load();
          setAddOpen(false);
          toast("Trade logged");
        }}
        defaultStrategy={usage ? undefined : undefined}
      />
    </div>
  );
}

function AddEntryModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  defaultStrategy?: string;
}) {
  const [symbol, setSymbol] = useState("BTC/USD");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [stop, setStop] = useState("");
  const [tp, setTp] = useState("");
  const [size, setSize] = useState("");
  const [strategy, setStrategy] = useState<JournalEntry["strategy"]>("swing");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dir = direction === "long" ? 1 : -1;
  const pnl = entry && exit && size ? (Number(exit) - Number(entry)) * Number(size) * dir : 0;
  const rMultiple = entry && exit && stop
    ? ((Number(exit) - Number(entry)) * dir) / Math.abs(Number(entry) - Number(stop))
    : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/journal", {
        symbol,
        direction,
        entry: Number(entry),
        exit: Number(exit),
        stop: stop ? Number(stop) : null,
        takeProfit: tp ? Number(tp) : null,
        size: Number(size),
        strategy,
        notes,
      });
      await onCreated();
      setEntry("");
      setExit("");
      setStop("");
      setTp("");
      setSize("");
      setNotes("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save the entry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log a closed trade"
      description="The more accurate the entry, the more useful the analysis."
      width="lg"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={submit} loading={busy} disabled={!entry || !exit || !size}>
            Save entry
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Asset">
            <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {INSTRUMENTS.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.symbol}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as "long" | "short")}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Entry">
            <NumericInput value={entry} onValueChange={setEntry} />
          </Field>
          <Field label="Exit">
            <NumericInput value={exit} onValueChange={setExit} />
          </Field>
          <Field label="Stop">
            <NumericInput value={stop} onValueChange={setStop} />
          </Field>
          <Field label="Target">
            <NumericInput value={tp} onValueChange={setTp} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Position size">
            <NumericInput value={size} onValueChange={setSize} />
          </Field>
          <Field label="Strategy">
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value as JournalEntry["strategy"])}>
              <option value="scalping">Scalping</option>
              <option value="day">Day trading</option>
              <option value="swing">Swing trading</option>
              <option value="longterm">Long-term</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>

        <Field label="Notes" hint="What did you see? What did you feel? What would you repeat or avoid?">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Entered on the retest of the breakout level. Held through the pullback because structure was intact…"
            className="w-full rounded-[7px] border border-hairline-2 bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink placeholder:text-ink-4 focus:border-[#3d444e] focus:outline-none"
          />
        </Field>

        {(pnl !== 0 || rMultiple != null) && (
          <div className="flex items-center justify-between rounded-[7px] border border-hairline bg-surface-2 px-3 py-2 text-[11.5px]">
            <span className="text-ink-3">Computed result</span>
            <span className="flex items-center gap-3">
              <span className={cn("tnum font-medium", pnl >= 0 ? "text-bull" : "text-bear")}>{fmtMoney(pnl, { sign: true })}</span>
              {rMultiple != null && (
                <span className={cn("tnum", rMultiple >= 0 ? "text-bull" : "text-bear")}>{rMultiple.toFixed(2)}R</span>
              )}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
