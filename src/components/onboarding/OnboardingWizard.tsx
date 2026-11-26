"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bitcoin,
  Building2,
  ChartCandlestick,
  Check,
  CircleDollarSign,
  Gem,
  Landmark,
  Brain,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { Alert, Button, ChoiceGrid, Field, Input, NumericInput, ProgressBar } from "@/components/ui";
import {
  EXPERIENCE_LABEL,
  RISK_PREFERENCE_HINT,
  RISK_PREFERENCE_LABEL,
  STYLE_DESCRIPTION,
  STYLE_LABEL,
} from "@/lib/constants";
import { INSTRUMENTS } from "@/lib/instruments";
import type { AssetClass, Experience, RiskPreference, TradingStyle, UserPreferences } from "@/lib/types";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "markets", label: "Markets" },
  { id: "style", label: "Style" },
  { id: "experience", label: "Experience" },
  { id: "risk", label: "Risk" },
  { id: "workspace", label: "Workspace" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const MARKET_OPTIONS: { value: AssetClass; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "crypto", label: "Crypto", hint: "BTC, ETH, SOL — 24/7", icon: <Bitcoin className="size-3.5" /> },
  { value: "forex", label: "Forex", hint: "Major currency pairs", icon: <CircleDollarSign className="size-3.5" /> },
  { value: "stocks", label: "Stocks", hint: "US single names", icon: <Building2 className="size-3.5" /> },
  { value: "indices", label: "Indices", hint: "S&P, Nasdaq, DAX", icon: <ChartCandlestick className="size-3.5" /> },
  { value: "commodities", label: "Commodities", hint: "Gold, crude oil", icon: <Gem className="size-3.5" /> },
];

const STYLE_OPTIONS: { value: TradingStyle; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "scalping", label: STYLE_LABEL.scalping, hint: "Seconds to minutes", icon: <Zap className="size-3.5" /> },
  { value: "day", label: STYLE_LABEL.day, hint: "Intraday, flat overnight", icon: <ChartCandlestick className="size-3.5" /> },
  { value: "swing", label: STYLE_LABEL.swing, hint: "Days to weeks", icon: <Landmark className="size-3.5" /> },
  { value: "longterm", label: STYLE_LABEL.longterm, hint: "Weeks to months", icon: <ShieldCheck className="size-3.5" /> },
];

export function OnboardingWizard({
  initialName,
  initialPreferences,
  alreadyOnboarded,
}: {
  initialName: string;
  initialPreferences: UserPreferences;
  alreadyOnboarded: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("welcome");
  const [name, setName] = useState(initialName);
  const [markets, setMarkets] = useState<AssetClass[]>(initialPreferences.markets);
  const [style, setStyle] = useState<TradingStyle>(initialPreferences.style);
  const [experience, setExperience] = useState<Experience>(initialPreferences.experience);
  const [riskPreference, setRiskPreference] = useState<RiskPreference>(initialPreferences.riskPreference);
  const [riskPct, setRiskPct] = useState(String(initialPreferences.defaultRiskPct));
  const [balance, setBalance] = useState(String(initialPreferences.defaultBalance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const progress = ((stepIndex + 0.0001) / (STEPS.length - 1)) * 100;

  const suggestedRisk =
    experience === "beginner" ? 0.5 : experience === "advanced" ? 1.5 : 1;

  const watched = useMemo(
    () => INSTRUMENTS.filter((i) => markets.includes(i.assetClass)).slice(0, 5),
    [markets],
  );

  const next = () => {
    const i = STEPS.findIndex((s) => s.id === step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1].id);
  };
  const back = () => {
    const i = STEPS.findIndex((s) => s.id === step);
    if (i > 0) setStep(STEPS[i - 1].id);
  };

  const finish = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.patch("/api/preferences", {
        markets,
        style,
        experience,
        riskPreference,
        defaultRiskPct: Math.max(0.05, Math.min(10, Number(riskPct) || 1)),
        defaultBalance: Math.max(100, Number(balance) || 10000),
        completeOnboarding: true,
      });
      // Seed the watchlist with a starter set so the workspace is immediately useful.
      await Promise.all(watched.map((i) => api.post("/api/watchlist", { symbol: i.symbol, action: "add" })));
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save your preferences.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* progress header */}
      <header className="border-b border-hairline px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-accent-ink">
            T
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between text-[10px] text-ink-4">
              <span className="uppercase tracking-[0.09em]">
                Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].label}
              </span>
              {alreadyOnboarded && <span>Editing setup</span>}
            </div>
            <ProgressBar value={progress} className="mt-1.5" height={3} />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        {error && (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        {/* ── 1. Welcome ─────────────────────────────────────── */}
        {step === "welcome" && (
          <div className="rise">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-[4px] border border-[#d7efff33] bg-accent-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
              <Sparkles className="size-3" strokeWidth={2} />
              Your AI trading workspace
            </div>
            <h1 className="text-[26px] font-semibold leading-[1.18] tracking-[-0.025em]">
              Welcome to TRADIA AI{name ? `, ${name.split(" ")[0]}` : ""}.
            </h1>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              Six short questions and we&apos;ll build your workspace around the way you actually trade.
              Everything you set here is editable later in Settings.
            </p>

            <div className="mt-5 space-y-2.5">
              {[
                {
                  icon: Brain,
                  title: "It shows its reasoning",
                  body: "Every analysis carries its evidence, timeframe, timestamp and invalidation level.",
                },
                {
                  icon: ShieldCheck,
                  title: "Risk comes first",
                  body: "Position sizing and portfolio heat are built into the workflow, not bolted on.",
                },
                {
                  icon: Landmark,
                  title: "Paper before real",
                  body: "Test the process on simulated capital. Simulated results are always labelled as such.",
                },
              ].map((t) => (
                <div key={t.title} className="flex gap-3 rounded-[8px] border border-hairline bg-surface p-3">
                  <t.icon className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
                  <div>
                    <div className="text-[12.5px] font-medium text-ink">{t.title}</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">{t.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <Field label="What should we call you?" htmlFor="ob-name">
                <Input
                  id="ob-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={60}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ── 2. Markets ─────────────────────────────────────── */}
        {step === "markets" && (
          <div className="rise">
            <h1 className="text-[22px] font-semibold tracking-[-0.022em]">Which markets do you trade?</h1>
            <p className="mt-1.5 mb-5 text-[12.5px] leading-relaxed text-ink-3">
              This shapes your scanner universe, default watchlist and the assets in your daily briefing.
            </p>
            <ChoiceGrid
              options={MARKET_OPTIONS}
              value={markets}
              onChange={(v) => setMarkets(v as AssetClass[])}
              columns={2}
            />
            <p className="mt-3 text-[10.5px] text-ink-4">Select one or more.</p>
          </div>
        )}

        {/* ── 3. Style ───────────────────────────────────────── */}
        {step === "style" && (
          <div className="rise">
            <h1 className="text-[22px] font-semibold tracking-[-0.022em]">What&apos;s your trading style?</h1>
            <p className="mt-1.5 mb-5 text-[12.5px] leading-relaxed text-ink-3">
              Your style decides which timeframes the AI prioritises and how wide it expects stops to be.
            </p>
            <ChoiceGrid
              options={STYLE_OPTIONS}
              value={style}
              onChange={(v) => setStyle(v as TradingStyle)}
              columns={2}
            />
            <div className="mt-4 rounded-[8px] border border-hairline-2 bg-surface p-3">
              <p className="text-[11.5px] leading-relaxed text-ink-2">{STYLE_DESCRIPTION[style]}</p>
            </div>
          </div>
        )}

        {/* ── 4. Experience ──────────────────────────────────── */}
        {step === "experience" && (
          <div className="rise">
            <h1 className="text-[22px] font-semibold tracking-[-0.022em]">How experienced are you?</h1>
            <p className="mt-1.5 mb-5 text-[12.5px] leading-relaxed text-ink-3">
              This changes how much explanation the AI attaches to each setup — not the analysis itself.
            </p>
            <ChoiceGrid
              options={(["beginner", "intermediate", "advanced"] as Experience[]).map((e) => ({
                value: e,
                label: EXPERIENCE_LABEL[e],
                hint:
                  e === "beginner"
                    ? "Explain every factor plainly"
                    : e === "intermediate"
                      ? "Explain the reasoning, skip the basics"
                      : "Dense detail, no hand-holding",
              }))}
              value={experience}
              onChange={(v) => setExperience(v as Experience)}
              columns={1}
            />
          </div>
        )}

        {/* ── 5. Risk ────────────────────────────────────────── */}
        {step === "risk" && (
          <div className="rise">
            <h1 className="text-[22px] font-semibold tracking-[-0.022em]">Set your risk defaults</h1>
            <p className="mt-1.5 mb-5 text-[12.5px] leading-relaxed text-ink-3">
              Used to pre-fill every position-size calculation. You can override it per trade — but a
              default you respect is the point.
            </p>

            <div className="mb-4">
              <ChoiceGrid
                options={(["conservative", "moderate", "aggressive"] as RiskPreference[]).map((r) => ({
                  value: r,
                  label: RISK_PREFERENCE_LABEL[r],
                  hint: RISK_PREFERENCE_HINT[r],
                }))}
                value={riskPreference}
                onChange={(v) => setRiskPreference(v as RiskPreference)}
                columns={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Risk per trade"
                suffix="% of equity"
                hint={
                  Number(riskPct) > 2
                    ? "Above 2% per trade is aggressive. A 5-loss streak would cost you serious capital."
                    : undefined
                }
              >
                <NumericInput value={riskPct} onValueChange={setRiskPct} placeholder="1" aria-label="Risk per trade percent" />
              </Field>
              <Field label="Account size" suffix="for sizing" hint="Paper balance used as your default equity.">
                <NumericInput value={balance} onValueChange={setBalance} placeholder="10000" aria-label="Account balance" />
              </Field>
            </div>

            <button
              type="button"
              onClick={() => setRiskPct(String(suggestedRisk))}
              className="mt-2 text-[11px] text-accent hover:underline"
            >
              Use {suggestedRisk}% — typical for {EXPERIENCE_LABEL[experience].toLowerCase()} traders
            </button>

            <div className="mt-4 rounded-[8px] border border-hairline-2 bg-surface p-3 text-[11.5px] leading-relaxed text-ink-2">
              At <span className="text-ink tnum">{riskPct || "1"}%</span> risk on{" "}
              <span className="text-ink tnum">${Number(balance || 0).toLocaleString("en-US")}</span>, one losing
              trade costs{" "}
              <span className="text-bear tnum">
                ${((Number(balance) || 0) * (Number(riskPct) || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
              . Ten consecutive losses at that size would leave you with{" "}
              <span className="text-ink tnum">
                ${((Number(balance) || 0) * (1 - (Number(riskPct) || 0) / 100) ** 10).toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
              .
            </div>
          </div>
        )}

        {/* ── 6. Workspace ───────────────────────────────────── */}
        {step === "workspace" && (
          <div className="rise">
            <h1 className="text-[22px] font-semibold tracking-[-0.022em]">Your AI Trading Workspace</h1>
            <p className="mt-1.5 mb-5 text-[12.5px] leading-relaxed text-ink-3">
              Here&apos;s what we&apos;ll set up. Everything is adjustable afterwards.
            </p>

            <div className="space-y-2.5">
              <SummaryRow label="Markets" value={markets.map((m) => MARKET_OPTIONS.find((o) => o.value === m)?.label ?? m).join(", ")} />
              <SummaryRow label="Trading style" value={`${STYLE_LABEL[style]} · ${STYLE_DESCRIPTION[style]}`} />
              <SummaryRow label="Experience" value={EXPERIENCE_LABEL[experience]} />
              <SummaryRow
                label="Risk defaults"
                value={`${riskPct || "1"}% per trade · ${RISK_PREFERENCE_LABEL[riskPreference]} · $${Number(balance || 0).toLocaleString("en-US")} equity`}
              />
              <SummaryRow label="Watchlist" value={watched.map((w) => w.symbol).join(" · ") || "—"} />
            </div>

            <div className="mt-4 rounded-[8px] border border-[#d7efff33] bg-accent-soft p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                <Check className="size-3.5" strokeWidth={2.5} />
                Ready to go
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
                Your first step: open the AI Analyst, pick an instrument and run{" "}
                <span className="text-ink">Analyze with AI</span>. You&apos;ll get a full market read plus
                any risk-defined setup the engine finds.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* footer nav */}
      <div className="sticky bottom-0 border-t border-hairline bg-canvas/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <Button variant="ghost" size="md" onClick={back} disabled={stepIndex === 0}>
            <ArrowLeft className="size-3.5" strokeWidth={2} />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {step !== "workspace" && step !== "welcome" && (
              <Button variant="ghost" size="md" onClick={next} className="text-ink-3">
                Skip
              </Button>
            )}
            {step === "workspace" ? (
              <Button variant="primary" size="md" onClick={finish} loading={busy}>
                Enter workspace
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={next}
                disabled={step === "markets" && markets.length === 0}
              >
                Continue
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[8px] border border-hairline bg-surface px-3 py-2.5">
      <span className="text-[11px] uppercase tracking-[0.07em] text-ink-4">{label}</span>
      <span className={cn("max-w-[62%] text-right text-[12px] text-ink")}>{value}</span>
    </div>
  );
}
