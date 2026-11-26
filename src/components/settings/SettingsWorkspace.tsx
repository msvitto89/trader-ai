"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Database, Lock, LogOut, Sparkles, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import {
  Alert,
  Badge,
  Button,
  ChoiceGrid,
  DemoBadge,
  Field,
  Input,
  NumericInput,
  Panel,
  ProgressBar,
  SectionHeading,
  StatRow,
  Switch,
  Tabs,
  useToast,
} from "@/components/ui";
import {
  EXPERIENCE_LABEL,
  RISK_PREFERENCE_HINT,
  RISK_PREFERENCE_LABEL,
  STYLE_LABEL,
} from "@/lib/constants";
import { ASSET_CLASS_LABEL } from "@/lib/instruments";
import { fmtDate } from "@/lib/format";
import type { AssetClass, Experience, RiskPreference, TradingStyle, UserPreferences } from "@/lib/types";

type Tab = "account" | "preferences" | "risk" | "watchlist" | "billing" | "data";

interface MeResponse {
  usage: { plan: string; analysesUsedToday: number; analysesLimit: number | null; scansUsedToday: number; scansLimit: number | null; chatsUsedToday: number; chatsLimit: number | null } | null;
  marketData: { provider: string; source: "demo" | "live"; label: string };
}

export function SettingsWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, usage, refresh, setUser, toggleWatch } = useSession();
  const { push: toast } = useToast();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "preferences");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<UserPreferences | null>(user?.preferences ?? null);
  const [riskPct, setRiskPct] = useState(String(user?.preferences.defaultRiskPct ?? 1));
  const [balance, setBalance] = useState(String(user?.preferences.defaultBalance ?? 10000));

  useEffect(() => {
    api.get<MeResponse>("/api/me").then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) setPrefs(user.preferences);
  }, [user]);

  if (!user || !prefs) {
    return <Panel><p className="py-8 text-center text-[12px] text-ink-3">Loading your settings…</p></Panel>;
  }

  const savePrefs = async (patch: Partial<UserPreferences>) => {
    setError(null);
    setSaving(true);
    try {
      const res = await api.patch<{ preferences: UserPreferences }>("/api/preferences", patch);
      setPrefs(res.preferences);
      setUser({ ...user, preferences: res.preferences });
      toast("Preferences saved");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const changePlan = async (plan: "free" | "pro") => {
    setSaving(true);
    try {
      const res = await api.post<{ note: string }>("/api/plan", { plan });
      await refresh();
      toast(res.note);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not change plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeading
        eyebrow="Settings"
        title="Workspace & preferences"
        description="Your trading profile feeds the AI: markets, style and risk defaults shape every analysis, scan and position-size calculation."
      />

      <Tabs
        className="mb-3"
        value={tab}
        onChange={(t) => setTab(t)}
        tabs={[
          { value: "preferences", label: "Preferences" },
          { value: "risk", label: "Risk" },
          { value: "watchlist", label: "Watchlist", count: user.watchlist.length },
          { value: "billing", label: "Plan & billing" },
          { value: "account", label: "Account" },
          { value: "data", label: "Data & trust" },
        ]}
      />

      {error && <div className="mb-3"><Alert tone="danger">{error}</Alert></div>}

      {/* ── Preferences ─────────────────────────────────────── */}
      {tab === "preferences" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Markets you trade" subtitle="Sets your scanner universe and briefing coverage">
            <ChoiceGrid
              options={(["crypto", "forex", "stocks", "indices", "commodities"] as AssetClass[]).map((c) => ({
                value: c,
                label: ASSET_CLASS_LABEL[c],
              }))}
              value={prefs.markets}
              onChange={(v) => {
                const next = v as AssetClass[];
                if (!next.length) return;
                void savePrefs({ markets: next });
              }}
              columns={2}
            />
          </Panel>

          <Panel title="Trading style" subtitle="Decides which timeframes the AI prioritises">
            <ChoiceGrid
              options={(["scalping", "day", "swing", "longterm"] as TradingStyle[]).map((s) => ({
                value: s,
                label: STYLE_LABEL[s],
              }))}
              value={prefs.style}
              onChange={(v) => void savePrefs({ style: v as TradingStyle })}
              columns={2}
            />
          </Panel>

          <Panel title="Experience level" subtitle="Adjusts how much explanation the AI attaches">
            <ChoiceGrid
              options={(["beginner", "intermediate", "advanced"] as Experience[]).map((e) => ({
                value: e,
                label: EXPERIENCE_LABEL[e],
              }))}
              value={prefs.experience}
              onChange={(v) => void savePrefs({ experience: v as Experience })}
              columns={3}
            />
          </Panel>

          <Panel title="Risk appetite" subtitle="Filters scanner results by volatility">
            <ChoiceGrid
              options={(["conservative", "moderate", "aggressive"] as RiskPreference[]).map((r) => ({
                value: r,
                label: RISK_PREFERENCE_LABEL[r],
                hint: RISK_PREFERENCE_HINT[r],
              }))}
              value={prefs.riskPreference}
              onChange={(v) => void savePrefs({ riskPreference: v as RiskPreference })}
              columns={1}
            />
          </Panel>
        </div>
      )}

      {/* ── Risk ────────────────────────────────────────────── */}
      {tab === "risk" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Default risk per trade" subtitle="Pre-fills every position-size calculation">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Risk per trade" suffix="% of equity">
                <NumericInput value={riskPct} onValueChange={setRiskPct} />
              </Field>
              <Field label="Account size" suffix="USD">
                <NumericInput value={balance} onValueChange={setBalance} />
              </Field>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0.25, 0.5, 1, 1.5, 2].map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskPct(String(r))}
                  className={cn(
                    "rounded-[4px] px-2 py-1 text-[10.5px] tnum",
                    Math.abs(Number(riskPct) - r) < 0.001 ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-surface-2",
                  )}
                >
                  {r}%
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-2">
              <StatRow label="Risk on one trade" value={`$${((Number(balance) || 0) * (Number(riskPct) || 0) / 100).toFixed(2)}`} tone="bear" />
              <StatRow label="After 5 losses" value={`$${((Number(balance) || 0) * (1 - (Number(riskPct) || 0) / 100) ** 5).toFixed(2)}`} />
              <StatRow label="After 5 wins (2R)" value={`$${((Number(balance) || 0) * (1 + ((Number(riskPct) || 0) * 2) / 100) ** 5).toFixed(2)}`} tone="bull" />
            </div>
            <Button
              variant="primary"
              size="md"
              className="mt-3 w-full"
              loading={saving}
              onClick={() =>
                void savePrefs({
                  defaultRiskPct: Math.max(0.05, Math.min(10, Number(riskPct) || 1)),
                  defaultBalance: Math.max(100, Number(balance) || 10000),
                })
              }
            >
              Save risk defaults
            </Button>
          </Panel>

          <Panel title="Notifications" subtitle="How TRADIA reaches you">
            <Switch
              checked={prefs.alertsEnabled}
              onChange={(v) => void savePrefs({ alertsEnabled: v })}
              label="Alert notifications"
              description="Evaluate alert rules on data refresh and record triggered events in-app."
            />
            <div className="hairline-x mt-1 pt-2.5">
              <Field label="Daily briefing time" suffix="UTC" hint="When your Daily Market Briefing is generated.">
                <Input
                  type="time"
                  value={prefs.briefingTime}
                  onChange={(e) => void savePrefs({ briefingTime: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Switch
                checked={prefs.compactMode}
                onChange={(v) => void savePrefs({ compactMode: v })}
                label="Compact density"
                description="Tighter spacing on data tables and panels."
              />
            </div>
          </Panel>
        </div>
      )}

      {/* ── Watchlist ───────────────────────────────────────── */}
      {tab === "watchlist" && (
        <Panel title="Your watchlist" subtitle="Instruments pinned across the workspace">
          {user.watchlist.length === 0 ? (
            <p className="py-6 text-center text-[11.5px] text-ink-4">
              No instruments pinned yet. Star an instrument in the AI Analyst or Scanner to add it here.
            </p>
          ) : (
            <div className="space-y-1">
              {user.watchlist.map((s) => (
                <div key={s} className="flex items-center justify-between rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-1.5">
                  <Link href={`/app/analyst?symbol=${encodeURIComponent(s)}`} className="flex items-center gap-1.5 text-[12px] text-ink hover:text-accent">
                    <Star className="size-3 text-accent" fill="currentColor" strokeWidth={0} />
                    {s}
                  </Link>
                  <button onClick={() => void toggleWatch(s)} className="p-1 text-ink-4 hover:text-bear" aria-label={`Remove ${s}`}>
                    <Trash2 className="size-3" strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* ── Billing ─────────────────────────────────────────── */}
      {tab === "billing" && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Panel
              className={cn(user.plan === "free" && "border-accent/30")}
              title="Free"
              action={user.plan === "free" ? <Badge tone="accent">Current</Badge> : undefined}
            >
              <div className="tnum text-[22px] font-semibold">$0</div>
              <ul className="mt-2 space-y-1.5 text-[11.5px] text-ink-2">
                {["8 AI analyses / day", "4 timeframes per analysis", "5 scanner runs / day", "6 ranked scan results", "12 open paper positions", "3 alerts", "Basic journal analytics"].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-3 shrink-0 text-ink-4" strokeWidth={2.4} />
                    {f}
                  </li>
                ))}
              </ul>
              {user.plan === "pro" && (
                <Button variant="outline" size="md" className="mt-3 w-full" onClick={() => void changePlan("free")} loading={saving}>
                  Downgrade to Free
                </Button>
              )}
            </Panel>

            <Panel
              className={cn(user.plan === "pro" && "border-accent/30")}
              title="Pro"
              action={user.plan === "pro" ? <Badge tone="accent">Current</Badge> : <Badge tone="muted">$29/mo</Badge>}
            >
              <div className="tnum text-[22px] font-semibold">
                $29<span className="text-[11px] font-normal text-ink-3">/mo</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-[11.5px] text-ink-2">
                {[
                  "Unlimited AI analyses",
                  "Full 7-timeframe analysis",
                  "Unlimited scanning, 15 ranked",
                  "Advanced multi-scenario forecasting",
                  "AI journal analytics & strategy breakdown",
                  "Advanced portfolio analytics",
                  "50 alerts",
                  "Unlimited paper positions",
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-3 shrink-0 text-accent" strokeWidth={2.4} />
                    {f}
                  </li>
                ))}
              </ul>
              {user.plan === "free" ? (
                <Button variant="primary" size="md" className="mt-3 w-full" onClick={() => void changePlan("pro")} loading={saving}>
                  <Sparkles className="size-3.5" strokeWidth={2.2} />
                  Enable Pro (demo)
                </Button>
              ) : (
                <p className="mt-3 text-center text-[10.5px] text-ink-4">Pro is active on this workspace.</p>
              )}
            </Panel>
          </div>

          <Panel title="Usage today">
            {usage ? (
              <div className="space-y-2.5">
                <Meter label="AI analyses" used={usage.analysesUsedToday} limit={usage.analysesLimit} />
                <Meter label="Scanner runs" used={usage.scansUsedToday} limit={usage.scansLimit} />
                <Meter label="Copilot messages" used={usage.chatsUsedToday} limit={usage.chatsLimit} />
              </div>
            ) : (
              <p className="text-[11px] text-ink-4">Usage unavailable.</p>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-ink-4">
              Daily counters reset at 00:00 UTC. Billing is simulated in this build: no payment is taken and
              the upgrade flips entitlements locally so the Pro experience can be evaluated. A production
              deployment gates plan changes behind a billing webhook — the entitlement layer stays identical.
            </p>
          </Panel>
        </div>
      )}

      {/* ── Account ─────────────────────────────────────────── */}
      {tab === "account" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Profile">
            <div className="space-y-2.5">
              <StatRow label="Name" value={user.name} />
              <StatRow label="Email" value={user.email} />
              <StatRow label="Member since" value={fmtDate(user.createdAt)} />
              <StatRow label="Plan" value={user.plan === "pro" ? "Pro" : "Free"} />
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-4">
              Credentials are stored as salted scrypt hashes. Sessions are httpOnly cookies with only a
              SHA-256 hash persisted server-side.
            </p>
          </Panel>

          <Panel title="Session">
            <p className="text-[11.5px] leading-relaxed text-ink-2">
              You are signed in on this device. Signing out invalidates the session server-side.
            </p>
            <Button
              variant="outline"
              size="md"
              className="mt-3"
              onClick={async () => {
                await api.post("/api/auth/logout");
                setUser(null);
                router.push("/");
                router.refresh();
              }}
            >
              <LogOut className="size-3.5" strokeWidth={2} />
              Sign out
            </Button>
          </Panel>
        </div>
      )}

      {/* ── Data & trust ────────────────────────────────────── */}
      {tab === "data" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Market data source" subtitle="Where prices on this workspace come from">
            <div className="flex items-center gap-2">
              <Database className="size-3.5 text-ink-3" strokeWidth={1.9} />
              <span className="text-[12px] text-ink">{me?.marketData.label ?? "—"}</span>
              {me && <DemoBadge source={me.marketData.source} />}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">
              {me?.marketData.source === "demo"
                ? "Prices are simulated by a deterministic engine for product evaluation. They are not live quotes and must not be used for real trading decisions."
                : "Prices come from a configured live market-data provider. Timestamps are attached to every analysis."}
            </p>
            <div className="mt-3 rounded-[6px] border border-hairline bg-surface-2 px-2.5 py-2 text-[10px] leading-relaxed text-ink-4">
              The market-data layer is provider-agnostic. Providers implement one interface
              (<code className="text-ink-3">MarketDataProvider</code>) and are selected server-side via
              <code className="text-ink-3"> MARKET_DATA_PROVIDER</code>. Credentials never reach the browser.
            </div>
          </Panel>

          <Panel title="AI engine" subtitle="How analysis is produced">
            <div className="space-y-1.5 text-[10.5px] leading-relaxed text-ink-3">
              {[
                "Technical analyzer — per-timeframe trend, momentum, volatility",
                "Market regime detector — trending / ranging / compression / high-vol",
                "Market analyzer — structure, support & resistance, overview",
                "Opportunity detector — confluence, entry zone, stop, targets, invalidation",
                "Risk analyzer — position size, R multiple, portfolio heat",
                "Portfolio & journal analyzers — performance and behaviour review",
              ].map((s) => (
                <div key={s} className="flex gap-2">
                  <span className="mt-[6px] size-1 shrink-0 rounded-full bg-ink-4" />
                  {s}
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[10px] leading-relaxed text-ink-4">
              All figures are computed deterministically server-side. An optional language model may only
              rephrase the narrative; it cannot introduce numbers. Analysis is educational information, not
              investment advice.
            </p>
          </Panel>

          <Panel title="Privacy & data" subtitle="What TRADIA stores">
            <div className="space-y-1.5 text-[10.5px] leading-relaxed text-ink-3">
              {[
                "Account email, name and a salted password hash",
                "Your preferences, watchlist and risk defaults",
                "Paper positions, journal entries and chat history you create",
                "Usage counters used for plan limits",
              ].map((s) => (
                <div key={s} className="flex gap-2">
                  <Lock className="mt-[1px] size-2.5 shrink-0 text-ink-4" strokeWidth={2} />
                  {s}
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[10px] leading-relaxed text-ink-4">
              Market analysis is computed per request and cached in memory only — it is not tied to your
              identity in storage. Nothing here is sold or shared.
            </p>
          </Panel>

          <Panel title="Important disclaimers">
            <p className="text-[10.5px] leading-relaxed text-ink-3">
              TRADIA AI provides market analysis and educational information and does not guarantee trading
              results. Setups are potential scenarios, confidence figures are AI estimates of confluence, and
              all analysis is based on available market data which may be delayed or simulated. Trading
              involves substantial risk of loss. You are solely responsible for your decisions.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-3 text-[10.5px]">
              <Link href="/legal/terms" className="text-accent hover:underline">Terms</Link>
              <Link href="/legal/privacy" className="text-accent hover:underline">Privacy</Link>
              <Link href="/legal/risk" className="text-accent hover:underline">Risk disclosure</Link>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-ink-3">{label}</span>
        <span className="tnum text-ink-4">{limit != null ? `${used} / ${limit}` : `${used} (unlimited)`}</span>
      </div>
      {limit != null && (
        <ProgressBar value={(used / limit) * 100} tone={used / limit > 0.85 ? "bear" : "accent"} className="mt-1" height={3} />
      )}
    </div>
  );
}
