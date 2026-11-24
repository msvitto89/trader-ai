"use client";

/**
 * Paper Trading.
 *
 * A complete simulated trade lifecycle: open, modify stops, close, review.
 * Simulated performance is visually and textually separated from real
 * performance everywhere it appears — never blended, never implied as live.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  FlaskConical,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Alert,
  Badge,
  Button,
  DemoBadge,
  EmptyState,
  Field,
  Input,
  Modal,
  NumericInput,
  Panel,
  SectionHeading,
  Segmented,
  Select,
  Skeleton,
  StatRow,
  Tabs,
  useToast,
} from "@/components/ui";
import { fmtMoney, fmtPct, fmtPrice, fmtQty, fmtTimeAgo } from "@/lib/format";
import { INSTRUMENTS } from "@/lib/instruments";
import type { Position } from "@/lib/types";

interface PaperResponse {
  positions: Position[];
  quotes: { symbol: string; price: number; changePct: number }[];
  source: "demo" | "live";
  entitlement: number | null;
}

export function PaperWorkspace() {
  const { user, refresh } = useSession();
  const { push: toast } = useToast();
  const [data, setData] = useState<PaperResponse | null>(null);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [closing, setClosing] = useState<Position | null>(null);
  const [modifying, setModifying] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PaperResponse>("/api/paper");
      setData(res);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not load paper trades.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const priceOf = (symbol: string) => data?.quotes.find((q) => q.symbol === symbol)?.price ?? null;
  const open = data?.positions.filter((p) => p.closedAt == null) ?? [];
  const closed = data?.positions.filter((p) => p.closedAt != null) ?? [];

  const unrealized = open.reduce((acc, p) => {
    const price = priceOf(p.symbol);
    if (price == null) return acc;
    const dir = p.direction === "long" ? 1 : -1;
    return acc + (price - p.entry) * p.size * dir;
  }, 0);

  const realized = closed.reduce((acc, p) => acc + (p.pnl ?? 0), 0);
  const wins = closed.filter((p) => (p.pnl ?? 0) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const equity = (user?.preferences.defaultBalance ?? 10000) + realized + unrealized;

  // Peak-to-trough drawdown across the closed-trade series.
  let peak = user?.preferences.defaultBalance ?? 10000;
  let maxDD = 0;
  let running = peak;
  for (const p of [...closed].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))) {
    running += p.pnl ?? 0;
    peak = Math.max(peak, running);
    maxDD = Math.max(maxDD, ((peak - running) / peak) * 100);
  }

  const closePosition = async (position: Position, exitPrice?: number) => {
    try {
      await api.post("/api/paper", { action: "close", id: position.id, exitPrice });
      await load();
      void refresh();
      toast(`${position.symbol} closed${exitPrice ? ` at ${exitPrice}` : " at market"}`);
      setClosing(null);
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.message : "Could not close the position", "error");
    }
  };

  return (
    <div>
      <SectionHeading
        eyebrow="Paper Trading"
        title="Test the process with simulated capital"
        description="Open virtual positions against real prices (or demo data), manage stops and targets, and track how the AI setups actually behave before you risk money."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void load()} loading={loading}>
              <RefreshCw className="size-3.5" strokeWidth={2} />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-3.5" strokeWidth={2.4} />
              New paper trade
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-[#d9a44126] bg-accent-soft px-3 py-2">
        <FlaskConical className="size-3.5 shrink-0 text-accent" strokeWidth={2} />
        <p className="text-[10.5px] leading-relaxed text-ink-2">
          <span className="font-semibold uppercase tracking-[0.06em] text-accent">Paper trading</span> — all
          positions and performance here are simulated. Nothing on this page is real trading performance.
          {data && <span className="ml-1"><DemoBadge source={data.source} /></span>}
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Stats */}
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Stat label="Paper equity" value={fmtMoney(equity)} sub={`start ${fmtMoney(user?.preferences.defaultBalance ?? 10000)}`} />
        <Stat label="Unrealised" value={fmtMoney(unrealized, { sign: true })} tone={unrealized >= 0 ? "bull" : "bear"} sub={`${open.length} open`} />
        <Stat label="Realised" value={fmtMoney(realized, { sign: true })} tone={realized >= 0 ? "bull" : "bear"} sub={`${closed.length} closed`} />
        <Stat label="Win rate" value={closed.length ? `${winRate.toFixed(0)}%` : "—"} sub={`${wins}/${closed.length} winners`} />
        <Stat label="Max drawdown" value={closed.length ? `${maxDD.toFixed(1)}%` : "—"} sub="peak to trough" tone={maxDD > 15 ? "bear" : undefined} />
      </div>

      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "open", label: "Open positions", count: open.length },
          { value: "closed", label: "Closed", count: closed.length },
        ]}
      />

      {loading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : tab === "open" ? (
        open.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<FlaskConical className="size-4" />}
              title="No open paper positions"
              description="Open one manually, or take a setup straight from the AI Analyst or Risk Manager — the levels are pre-filled for you."
              action={
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
                    New paper trade
                  </Button>
                  <Link
                    href="/app/signals"
                    className="inline-flex h-8 items-center rounded-[6px] border border-hairline-2 bg-surface-3 px-3 text-[12.5px] text-ink hover:bg-[#22262e]"
                  >
                    Browse AI setups
                  </Link>
                </div>
              }
            />
          </Panel>
        ) : (
          <div className="space-y-2">
            {open.map((p) => (
              <OpenPositionRow
                key={p.id}
                position={p}
                price={priceOf(p.symbol)}
                onClose={() => setClosing(p)}
                onModify={() => setModifying(p)}
              />
            ))}
          </div>
        )
      ) : closed.length === 0 ? (
        <Panel>
          <EmptyState icon={<BookOpen className="size-4" />} title="No closed trades yet" description="Close a paper position and it appears here with realised P&L, ready to copy into your journal." />
        </Panel>
      ) : (
        <Panel dense>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Side</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Exit</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">P&L</th>
                  <th className="text-right">%</th>
                  <th>Closed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {closed.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-ink">{p.symbol}</td>
                    <td>
                      <Badge tone={p.direction === "long" ? "bull" : "bear"}>{p.direction}</Badge>
                    </td>
                    <td className="tnum text-right text-ink-2">{fmtPrice(p.entry, p.symbol)}</td>
                    <td className="tnum text-right text-ink-2">{fmtPrice(p.exitPrice, p.symbol)}</td>
                    <td className="tnum text-right text-ink-3">{fmtQty(p.size, p.symbol)}</td>
                    <td className={cn("tnum text-right font-medium", (p.pnl ?? 0) >= 0 ? "text-bull" : "text-bear")}>
                      {fmtMoney(p.pnl, { sign: true })}
                    </td>
                    <td className={cn("tnum text-right", (p.pnlPct ?? 0) >= 0 ? "text-bull" : "text-bear")}>
                      {fmtPct(p.pnlPct, { sign: true })}
                    </td>
                    <td className="text-ink-4">{p.closedAt ? fmtTimeAgo(p.closedAt) : "—"}</td>
                    <td>
                      <button
                        onClick={() => void copyToJournal(p)}
                        className="inline-flex items-center gap-1 rounded-[4px] border border-hairline-2 px-1.5 py-0.5 text-[10px] text-ink-3 hover:text-ink"
                      >
                        <BookOpen className="size-2.5" strokeWidth={2} />
                        Journal
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-ink-4">
        Simulated results are not a reliable predictor of live performance: paper fills do not experience
        slippage, partial fills, financing costs or the psychology of real capital at risk.
      </p>

      {/* ── New trade modal ────────────────────────────────── */}
      <NewTradeModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        balance={user?.preferences.defaultBalance ?? 10000}
        riskPct={user?.preferences.defaultRiskPct ?? 1}
        entitlement={data?.entitlement ?? null}
        openCount={open.length}
        onCreated={async () => {
          await load();
          void refresh();
          toast("Paper position opened");
          setNewOpen(false);
        }}
      />

      {/* ── Close modal ─────────────────────────────────────── */}
      {closing && (
        <CloseModal
          position={closing}
          mark={priceOf(closing.symbol)}
          onClose={() => setClosing(null)}
          onConfirm={(price) => void closePosition(closing, price)}
        />
      )}

      {/* ── Modify modal ────────────────────────────────────── */}
      {modifying && (
        <ModifyModal
          position={modifying}
          onClose={() => setModifying(null)}
          onSaved={async () => {
            await load();
            setModifying(null);
            toast("Levels updated");
          }}
          onDelete={async () => {
            await api.del("/api/paper", { id: modifying.id }).catch(() => {});
            await load();
            setModifying(null);
            toast("Position deleted");
          }}
        />
      )}
    </div>
  );
}

async function copyToJournal(p: Position) {
  try {
    await api.post("/api/journal", { fromPaperPosition: p });
    window.location.href = "/app/journal";
  } catch {
    /* surfaced on the journal page */
  }
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "bull" | "bear" }) {
  return (
    <div className="panel-flat px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className={cn("tnum mt-0.5 text-[15px] font-medium", tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-ink")}>
        {value}
      </div>
      <div className="truncate text-[9.5px] text-ink-4">{sub}</div>
    </div>
  );
}

function OpenPositionRow({
  position,
  price,
  onClose,
  onModify,
}: {
  position: Position;
  price: number | null;
  onClose: () => void;
  onModify: () => void;
}) {
  const dir = position.direction === "long" ? 1 : -1;
  const pnl = price != null ? (price - position.entry) * position.size * dir : null;
  const pnlPct = price != null ? ((price - position.entry) / position.entry) * 100 * dir : null;
  const risk = position.stop != null ? Math.abs(position.entry - position.stop) * position.size : null;
  const rMultiple = price != null && position.stop != null
    ? ((price - position.entry) * dir) / Math.abs(position.entry - position.stop)
    : null;

  return (
    <div className="panel px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[130px] items-center gap-2">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-[6px] border",
              position.direction === "long" ? "border-[#3fae8633] bg-bull-soft text-bull" : "border-[#d2595c33] bg-bear-soft text-bear",
            )}
          >
            {position.direction === "long" ? <ArrowUpRight className="size-3.5" strokeWidth={2.4} /> : <ArrowDownRight className="size-3.5" strokeWidth={2.4} />}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-medium">{position.symbol}</span>
              {position.source === "ai-setup" && <Badge tone="accent">AI</Badge>}
            </div>
            <div className="tnum text-[10px] text-ink-4">{fmtQty(position.size, position.symbol)} · {fmtTimeAgo(position.openedAt)}</div>
          </div>
        </div>

        <div className="min-w-[70px]">
          <div className="text-[9.5px] uppercase tracking-[0.06em] text-ink-4">Entry</div>
          <div className="tnum text-[11.5px] text-ink-2">{fmtPrice(position.entry, position.symbol)}</div>
        </div>

        <div className="min-w-[70px]">
          <div className="text-[9.5px] uppercase tracking-[0.06em] text-ink-4">Mark</div>
          <div className="tnum text-[11.5px] text-ink">{price != null ? fmtPrice(price, position.symbol) : "—"}</div>
        </div>

        <div className="min-w-[80px]">
          <div className="text-[9.5px] uppercase tracking-[0.06em] text-ink-4">Stop / Target</div>
          <div className="tnum text-[11px]">
            <span className="text-bear">{position.stop != null ? fmtPrice(position.stop, position.symbol) : "—"}</span>
            <span className="text-ink-4"> / </span>
            <span className="text-bull">{position.takeProfit != null ? fmtPrice(position.takeProfit, position.symbol) : "—"}</span>
          </div>
        </div>

        <div className="ml-auto text-right">
          <div className={cn("tnum text-[14px] font-medium", pnl == null ? "text-ink-4" : pnl >= 0 ? "text-bull" : "text-bear")}>
            {pnl != null ? fmtMoney(pnl, { sign: true }) : "—"}
          </div>
          <div className="tnum text-[10px] text-ink-4">
            {pnlPct != null ? fmtPct(pnlPct, { sign: true }) : ""}
            {rMultiple != null && ` · ${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R`}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={onModify}>
            Modify
          </Button>
          <Button size="sm" variant="primary" onClick={onClose}>
            <X className="size-3" strokeWidth={2.6} />
            Close
          </Button>
        </div>
      </div>

      {risk != null && (
        <div className="mt-1.5 flex items-center gap-2 border-t border-hairline pt-1.5 text-[9.5px] text-ink-4">
          <span>Risk at stop {fmtMoney(risk)}</span>
          {position.notes && <span className="truncate">· {position.notes}</span>}
        </div>
      )}
    </div>
  );
}

function NewTradeModal({
  open,
  onClose,
  balance,
  riskPct,
  entitlement,
  openCount,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  balance: number;
  riskPct: number;
  entitlement: number | null;
  openCount: number;
  onCreated: () => Promise<void>;
}) {
  const [symbol, setSymbol] = useState("BTC/USD");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [tp, setTp] = useState("");
  const [size, setSize] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest size from the risk defaults whenever the stop changes.
  const riskAmount = (balance * riskPct) / 100;
  const stopDist = entry && stop ? Math.abs(Number(entry) - Number(stop)) : 0;
  const suggested = stopDist > 0 ? riskAmount / stopDist : 0;

  useEffect(() => {
    if (suggested > 0) setSize(suggested.toFixed(4));
  }, [suggested]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/paper", {
        symbol,
        direction,
        size: Number(size),
        entry: Number(entry),
        stop: stop ? Number(stop) : null,
        takeProfit: tp ? Number(tp) : null,
        notes: note,
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not open the trade.");
    } finally {
      setBusy(false);
    }
  };

  const limitReached = entitlement != null && openCount >= entitlement;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New paper trade"
      description="Simulated position, real price feed."
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={submit} loading={busy} disabled={!entry || !size || limitReached}>
            Open paper trade
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {limitReached && (
          <Alert tone="warn" title="Position limit reached">
            The Free plan allows {entitlement} open paper positions.{" "}
            <Link href="/app/settings?tab=billing" className="underline">Upgrade for unlimited</Link>.
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Instrument">
            <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
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
              onChange={setDirection}
              options={[
                { value: "long" as const, label: "Long" },
                { value: "short" as const, label: "Short" },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Entry">
            <NumericInput value={entry} onValueChange={setEntry} />
          </Field>
          <Field label="Stop">
            <NumericInput value={stop} onValueChange={setStop} />
          </Field>
          <Field label="Target">
            <NumericInput value={tp} onValueChange={setTp} />
          </Field>
        </div>

        <Field label="Size" hint={suggested > 0 ? `Suggested ${suggested.toFixed(4)} to risk ${fmtMoney(riskAmount)} (${riskPct}%)` : undefined}>
          <NumericInput value={size} onValueChange={setSize} />
        </Field>

        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you're taking this trade" maxLength={200} />
        </Field>
      </div>
    </Modal>
  );
}

function CloseModal({
  position,
  mark,
  onClose,
  onConfirm,
}: {
  position: Position;
  mark: number | null;
  onClose: () => void;
  onConfirm: (price: number | undefined) => void;
}) {
  const [price, setPrice] = useState(mark != null ? String(mark) : "");
  const [busy, setBusy] = useState(false);

  const dir = position.direction === "long" ? 1 : -1;
  const pnl = price ? (Number(price) - position.entry) * position.size * dir : 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Close ${position.symbol}`}
      description={`${position.direction.toUpperCase()} ${fmtQty(position.size, position.symbol)} from ${fmtPrice(position.entry, position.symbol)}`}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={busy}
            onClick={() => {
              setBusy(true);
              onConfirm(price ? Number(price) : undefined);
            }}
          >
            Close at {price ? fmtPrice(Number(price), position.symbol) : "market"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Exit price" hint="Leave as the current mark to close at market.">
          <NumericInput value={price} onValueChange={setPrice} />
        </Field>
        <div className="rounded-[7px] border border-hairline bg-surface-2 px-3 py-2">
          <StatRow label="Entry" value={fmtPrice(position.entry, position.symbol)} />
          <StatRow label="Exit" value={price ? fmtPrice(Number(price), position.symbol) : "mark"} />
          <StatRow
            label="Realised P&L"
            value={fmtMoney(pnl, { sign: true })}
            tone={pnl >= 0 ? "bull" : "bear"}
          />
        </div>
      </div>
    </Modal>
  );
}

function ModifyModal({
  position,
  onClose,
  onSaved,
  onDelete,
}: {
  position: Position;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [stop, setStop] = useState(position.stop != null ? String(position.stop) : "");
  const [tp, setTp] = useState(position.takeProfit != null ? String(position.takeProfit) : "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/api/paper", {
        action: "modify",
        id: position.id,
        stop: stop ? Number(stop) : null,
        takeProfit: tp ? Number(tp) : null,
      });
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage ${position.symbol}`}
      description="Move the stop to break-even, trail it, or adjust the target."
      footer={
        <>
          <Button variant="danger" size="md" onClick={() => void onDelete()} className="mr-auto">
            <Trash2 className="size-3.5" strokeWidth={2} />
            Delete
          </Button>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={save} loading={busy}>
            Save levels
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Stop loss" hint={`Entry ${fmtPrice(position.entry, position.symbol)}`}>
            <NumericInput value={stop} onValueChange={setStop} />
          </Field>
          <Field label="Take profit">
            <NumericInput value={tp} onValueChange={setTp} />
          </Field>
        </div>
        <button
          onClick={() => setStop(String(position.entry))}
          className="text-[11px] text-accent hover:underline"
        >
          Move stop to break-even ({fmtPrice(position.entry, position.symbol)})
        </button>
      </div>
    </Modal>
  );
}
