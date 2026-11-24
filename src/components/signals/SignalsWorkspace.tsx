"use client";

/**
 * Signals — a live feed of AI-detected opportunities plus the user's alert
 * rules. Deliberately shows "no setup" states rather than padding the feed:
 * a signal page that always has content is a marketing page, not a tool.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Lock, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  NumericInput,
  Panel,
  SectionHeading,
  Select,
  Skeleton,
  Tabs,
  useToast,
} from "@/components/ui";
import { SetupCard } from "@/components/analyst/SetupCard";
import { fmtTimeAgo } from "@/lib/format";
import { INSTRUMENTS } from "@/lib/instruments";
import { ALERT_KIND_LABEL } from "@/lib/constants";
import type { AlertEvent, AlertRule, ScannedAsset } from "@/lib/types";

interface ScanResponse {
  rows: ScannedAsset[];
  source: "demo" | "live";
  asOf: number;
  scanned: number;
}

export function SignalsWorkspace() {
  const { user, refresh } = useSession();
  const { push: toast } = useToast();
  const [tab, setTab] = useState<"feed" | "alerts">("feed");
  const [feed, setFeed] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitInfo, setLimitInfo] = useState<string | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [maxAlerts, setMaxAlerts] = useState(3);
  const [newAlertOpen, setNewAlertOpen] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await api.get<{ rules: AlertRule[]; events: AlertEvent[]; maxAlerts: number }>("/api/alerts");
      setRules(res.rules);
      setEvents(res.events);
      setMaxAlerts(res.maxAlerts);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLimitInfo(null);
    try {
      const res = await api.post<ScanResponse>("/api/scan", {
        assetClasses: user?.preferences.markets ?? ["crypto"],
        style: user?.preferences.style ?? "day",
        risk: user?.preferences.riskPreference ?? "moderate",
      });
      setFeed(res);
      void refresh();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "PLAN_LIMIT") setLimitInfo(err.message);
      else setError(err instanceof ApiRequestError ? err.message : "Could not refresh signals.");
    } finally {
      setLoading(false);
    }
  }, [user?.preferences, refresh]);

  useEffect(() => {
    void loadFeed();
    void loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const evaluate = async () => {
    setEvaluating(true);
    try {
      const res = await api.post<{ created: number }>("/api/alerts", { action: "evaluate" });
      await loadAlerts();
      toast(res.created ? `${res.created} alert${res.created === 1 ? "" : "s"} triggered` : "No alerts triggered — conditions not met", res.created ? "success" : "info");
    } catch {
      toast("Could not evaluate alerts", "error");
    } finally {
      setEvaluating(false);
    }
  };

  const opportunities = (feed?.rows ?? []).filter((r) => r.setup);

  return (
    <div>
      <SectionHeading
        eyebrow="Signals"
        title="AI opportunity feed"
        description="Setups that cleared the engine's confluence threshold, refreshed against current data — plus your own alert rules."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void loadFeed()} loading={loading}>
              <RefreshCw className="size-3.5" strokeWidth={2} />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setNewAlertOpen(true)}>
              <Plus className="size-3.5" strokeWidth={2.4} />
              New alert
            </Button>
          </div>
        }
      />

      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "feed", label: "Opportunities", count: opportunities.length },
          { value: "alerts", label: "Alerts", count: rules.length },
        ]}
      />

      {error && <Alert tone="danger">{error}</Alert>}
      {limitInfo && (
        <Alert tone="warn" title="Scan limit reached">
          {limitInfo} The feed below shows your last scan.
        </Alert>
      )}

      {tab === "feed" && (
        <>
          {loading && !feed && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Skeleton className="h-56" />
              <Skeleton className="h-56" />
            </div>
          )}

          {feed && !opportunities.length && (
            <Panel>
              <EmptyState
                icon={<Sparkles className="size-4" />}
                title="No qualifying setups right now"
                description={`The engine scanned ${feed.scanned} instruments and none cleared the confluence bar for your style and risk settings. Forcing a trade here is how capital gets donated — the scanner will re-evaluate on the next refresh.`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void loadFeed()}>
                    Re-scan now
                  </Button>
                }
              />
            </Panel>
          )}

          {!!opportunities.length && (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {opportunities.map((row) => (
                <SetupCard
                  key={row.symbol}
                  setup={row.setup!}
                  source={row.source}
                  compact
                />
              ))}
            </div>
          )}

          {feed && (
            <p className="mt-3 text-[10px] leading-relaxed text-ink-4">
              Setups are potential scenarios derived from available market data, not recommendations. Confidence is
              an AI estimate of confluence — never a probability of profit. Data as of {fmtTimeAgo(feed.asOf)}.
            </p>
          )}
        </>
      )}

      {tab === "alerts" && (
        <div className="space-y-3">
          <Panel
            title="Alert rules"
            subtitle={`${rules.length} of ${maxAlerts} used on your plan`}
            action={
              <Button variant="secondary" size="sm" onClick={() => void evaluate()} loading={evaluating}>
                <RefreshCw className="size-3.5" strokeWidth={2} />
                Check now
              </Button>
            }
          >
            {rules.length === 0 ? (
              <EmptyState
                icon={<BellOff className="size-4" />}
                title="No alerts yet"
                description="Create a price, breakout, trend-change or AI-opportunity alert and TRADIA will watch it for you."
                action={
                  <Button variant="primary" size="sm" onClick={() => setNewAlertOpen(true)}>
                    Create your first alert
                  </Button>
                }
              />
            ) : (
              <div className="space-y-1.5">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between gap-3 rounded-[7px] border border-hairline bg-surface-2 px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] font-medium text-ink">{rule.symbol}</span>
                        <Badge tone="muted">{ALERT_KIND_LABEL[rule.kind]}</Badge>
                        {rule.value != null && <span className="tnum text-[11px] text-ink-3">@ {rule.value}</span>}
                      </div>
                      {rule.note && <p className="mt-0.5 truncate text-[10.5px] text-ink-4">{rule.note}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={async () => {
                          await api.patch("/api/alerts", { id: rule.id, active: !rule.active }).catch(() => {});
                          void loadAlerts();
                        }}
                        className={cn("rounded-[4px] px-1.5 py-0.5 text-[10px]", rule.active ? "bg-bull-soft text-bull" : "bg-surface-3 text-ink-4")}
                      >
                        {rule.active ? "Active" : "Paused"}
                      </button>
                      <button
                        onClick={async () => {
                          await api.del("/api/alerts", { id: rule.id }).catch(() => {});
                          void loadAlerts();
                        }}
                        className="p-1 text-ink-4 hover:text-bear"
                        aria-label="Delete alert"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {rules.length >= maxAlerts && (
              <div className="mt-2.5 flex items-center gap-2 rounded-[6px] border border-[#d9a44126] bg-accent-soft px-2.5 py-2">
                <Lock className="size-3.5 shrink-0 text-accent" strokeWidth={2} />
                <p className="text-[10.5px] text-ink-2">
                  Alert limit reached ({maxAlerts}).{" "}
                  <Link href="/app/settings?tab=billing" className="text-accent hover:underline">
                    Pro raises this to 50
                  </Link>
                  .
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Recent triggers" subtitle="Alert events from your rules">
            {events.length === 0 ? (
              <EmptyState icon={<Bell className="size-4" />} title="No triggers yet" description="When a rule's condition is met, the event appears here with the data that caused it." />
            ) : (
              <div className="space-y-1.5">
                {events.map((ev) => (
                  <div key={ev.id} className="rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn("text-[11.5px] font-medium", ev.read ? "text-ink-2" : "text-ink")}>{ev.title}</span>
                      <span className="shrink-0 text-[9.5px] text-ink-4">{fmtTimeAgo(ev.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-3">{ev.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      <NewAlertModal
        open={newAlertOpen}
        onClose={() => setNewAlertOpen(false)}
        onCreated={() => {
          void loadAlerts();
          toast("Alert created");
        }}
        defaultSymbol={user?.watchlist[0] ?? "BTC/USD"}
      />
    </div>
  );
}

function NewAlertModal({
  open,
  onClose,
  onCreated,
  defaultSymbol,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultSymbol: string;
}) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [kind, setKind] = useState<AlertRule["kind"]>("price-above");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsValue = ["price-above", "price-below", "risk"].includes(kind);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/alerts", {
        symbol,
        kind,
        value: needsValue ? Number(value) : null,
        note,
      });
      onCreated();
      onClose();
      setValue("");
      setNote("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not create the alert.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create an alert"
      description="TRADIA evaluates your rules against current market data and AI output."
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={submit} loading={busy}>
            Create alert
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="Instrument">
          <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {INSTRUMENTS.map((i) => (
              <option key={i.symbol} value={i.symbol}>
                {i.symbol} — {i.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Alert type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as AlertRule["kind"])}>
            {(Object.keys(ALERT_KIND_LABEL) as AlertRule["kind"][]).map((k) => (
              <option key={k} value={k}>
                {ALERT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>

        {needsValue && (
          <Field
            label={kind === "risk" ? "Volatility threshold (ATR % of price)" : "Price level"}
            hint={kind === "risk" ? "Fires when realised ATR exceeds this percentage." : undefined}
          >
            <NumericInput value={value} onValueChange={setValue} placeholder={kind === "risk" ? "1.5" : "68000"} />
          </Field>
        )}

        <Field label="Note (optional)" hint="Remind yourself why this alert matters.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notify me when BTC enters the AI setup zone" maxLength={240} />
        </Field>

        <div className="rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-3">
          Alerts are evaluated on demand and on data refresh. This build records events in-app; email and push
          delivery are a transport layer, not a different rule engine.
        </div>
      </div>
    </Modal>
  );
}
