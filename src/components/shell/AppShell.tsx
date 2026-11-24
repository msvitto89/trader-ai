"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Brain,
  FlaskConical,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Radar,
  Settings,
  Shield,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/client/store";
import { api } from "@/lib/client/api";
import { DemoBadge, LinkButton, ToastProvider } from "@/components/ui";
import { DEMO_DATA_SOURCE } from "@/lib/constants";

const NAV = [
  { href: "/app", label: "Home", icon: LayoutDashboard },
  { href: "/app/analyst", label: "AI Analyst", icon: Brain, featured: true },
  { href: "/app/scanner", label: "Market Scanner", icon: Radar },
  { href: "/app/signals", label: "Signals", icon: Sparkles },
  { href: "/app/charts", label: "Charts", icon: LineChart },
  { href: "/app/risk", label: "Risk Manager", icon: Shield },
  { href: "/app/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/app/journal", label: "Trading Journal", icon: BookOpen },
  { href: "/app/paper", label: "Paper Trading", icon: FlaskConical },
  { href: "/app/chat", label: "AI Chat", icon: Activity },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV = [
  { href: "/app", label: "Home", icon: LayoutDashboard },
  { href: "/app/scanner", label: "Markets", icon: Radar },
  { href: "/app/signals", label: "Signals", icon: Sparkles },
  { href: "/app/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/app/chat", label: "AI", icon: Brain },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, usage } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const current = NAV.find((n) => isActive(pathname, n.href));
  const plan = usage?.plan ?? user?.plan ?? "free";
  const analysesLeft =
    usage?.analysesLimit != null ? Math.max(0, usage.analysesLimit - usage.analysesUsedToday) : null;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-canvas">
        {/* ── Desktop sidebar ──────────────────────────────────── */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] flex-col border-r border-hairline bg-[#0c0d10] lg:flex">
          <BrandBlock />

          <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Primary">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-[12.5px] transition-colors",
                    active
                      ? "bg-surface-2 text-ink"
                      : "text-ink-3 hover:bg-surface/70 hover:text-ink-2",
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-accent" />
                  )}
                  <item.icon
                    className={cn("size-[15px] shrink-0", active ? "text-accent" : "text-ink-4 group-hover:text-ink-3")}
                    strokeWidth={1.8}
                  />
                  <span className={cn(active && "font-medium")}>{item.label}</span>
                  {item.featured && !active && (
                    <span className="ml-auto size-1 rounded-full bg-accent/70" aria-hidden />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-hairline p-2.5">
            {plan === "free" ? (
              <div className="rounded-[8px] border border-[#d9a44126] bg-accent-soft p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                  <Sparkles className="size-3" strokeWidth={2} />
                  Free plan
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-ink-3">
                  {analysesLeft != null ? `${analysesLeft} AI analyses left today` : "Daily analysis limit reached"}
                  {" · "}
                  {usage?.scansLimit != null
                    ? `${Math.max(0, usage.scansLimit - (usage.scansUsedToday ?? 0))} scans`
                    : "unlimited scans"}
                </p>
                <Link
                  href="/app/settings?tab=billing"
                  className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-[5px] bg-accent px-2 py-1.5 text-[11px] font-semibold text-accent-ink hover:bg-[#e3b155]"
                >
                  Upgrade to Pro
                  <ArrowUpRight className="size-3" strokeWidth={2.2} />
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-[8px] border border-hairline-2 bg-surface px-2.5 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                  <Sparkles className="size-3" strokeWidth={2} />
                  Pro
                </span>
                <span className="text-[10px] text-ink-4">Unlimited AI</span>
              </div>
            )}

            <UserRow signingOut={signingOut} setSigningOut={setSigningOut} />
          </div>
        </aside>

        {/* ── Mobile drawer ────────────────────────────────────── */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              className="absolute inset-0 bg-black/70"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            />
            <div className="relative h-full w-[268px] border-r border-hairline bg-[#0c0d10] rise">
              <div className="flex items-center justify-between px-3 py-3">
                <BrandMark />
                <button onClick={() => setMobileOpen(false)} className="p-1.5 text-ink-3" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
              <nav className="px-2 pb-4">
                {NAV.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[6px] px-2.5 py-2.5 text-[13px]",
                        active ? "bg-surface-2 text-ink" : "text-ink-3",
                      )}
                    >
                      <item.icon className={cn("size-4", active ? "text-accent" : "text-ink-4")} strokeWidth={1.8} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-hairline p-2.5">
                <UserRow signingOut={signingOut} setSigningOut={setSigningOut} />
              </div>
            </div>
          </div>
        )}

        {/* ── Main ─────────────────────────────────────────────── */}
        <div className="lg:pl-[228px]">
          <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-hairline bg-canvas/90 px-3 backdrop-blur-md sm:px-5">
            <div className="flex items-center gap-2 min-w-0">
              <button
                className="p-1.5 text-ink-2 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="size-4.5" />
              </button>
              <span className="hidden text-[12px] text-ink-3 lg:inline">
                {current?.label ?? "Workspace"}
              </span>
              <span className="lg:hidden">
                <BrandMark compact />
              </span>
            </div>

            <div className="flex items-center gap-2">
              {DEMO_DATA_SOURCE && (
                <span className="hidden sm:inline">
                  <DemoBadge source="demo" />
                </span>
              )}
              <Link
                href="/app/signals"
                className="hidden items-center gap-1.5 rounded-[6px] border border-hairline-2 bg-surface px-2 py-1.5 text-[11.5px] text-ink-2 hover:text-ink sm:inline-flex"
              >
                <Bell className="size-3.5" strokeWidth={1.8} />
                Alerts
              </Link>
              <LinkButton href="/app/analyst" variant="primary" size="sm" className="hidden sm:inline-flex">
                <Brain className="size-3.5" strokeWidth={2} />
                Analyze
              </LinkButton>
              <Link
                href="/app/chat"
                className="inline-flex items-center justify-center rounded-[6px] bg-accent p-2 text-accent-ink sm:hidden"
                aria-label="Open AI copilot"
              >
                <Brain className="size-4" strokeWidth={2} />
              </Link>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1480px] px-3 pb-24 pt-4 sm:px-5 sm:pb-10 sm:pt-5">
            {children}
          </main>

          <footer className="hidden border-t border-hairline px-5 py-4 text-[10.5px] leading-relaxed text-ink-4 sm:block">
            <div className="mx-auto flex max-w-[1480px] items-start justify-between gap-6">
              <p className="max-w-3xl">
                TRADIA AI provides market analysis and educational information and does not guarantee trading
                results. Setups are potential scenarios derived from available market data, not recommendations.
                Trading involves substantial risk of loss.
              </p>
              <div className="flex shrink-0 items-center gap-3">
                <Link href="/legal/terms" className="hover:text-ink-3">
                  Terms
                </Link>
                <Link href="/legal/privacy" className="hover:text-ink-3">
                  Privacy
                </Link>
                <Link href="/legal/risk" className="hover:text-ink-3">
                  Risk
                </Link>
              </div>
            </div>
          </footer>
        </div>

        {/* ── Mobile tab bar ───────────────────────────────────── */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-[#0c0d10]/95 backdrop-blur-md lg:hidden"
          aria-label="Primary"
        >
          <div className="mx-auto flex max-w-md items-stretch">
            {MOBILE_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-1 flex-col items-center gap-1 py-2.5"
                >
                  <item.icon
                    className={cn("size-[18px]", active ? "text-accent" : "text-ink-4")}
                    strokeWidth={active ? 2.1 : 1.8}
                  />
                  <span className={cn("text-[9.5px] tracking-wide", active ? "text-ink" : "text-ink-4")}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
      </div>
    </ToastProvider>
  );
}

function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <Link href="/app" className="flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-accent-ink">
        T
      </span>
      <span className={cn("font-semibold tracking-[0.08em]", compact ? "text-[12px]" : "text-[13px]")}>
        TRADIA <span className="text-accent">AI</span>
      </span>
    </Link>
  );
}

function BrandBlock() {
  return (
    <div className="flex h-12 items-center gap-2 border-b border-hairline px-3.5">
      <span className="flex size-6 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-accent-ink">
        T
      </span>
      <span className="text-[13px] font-semibold tracking-[0.08em]">
        TRADIA <span className="text-accent">AI</span>
      </span>
      <span className="ml-auto text-[9px] uppercase tracking-[0.1em] text-ink-4">Beta</span>
    </div>
  );
}

function UserRow({
  signingOut,
  setSigningOut,
}: {
  signingOut: boolean;
  setSigningOut: (v: boolean) => void;
}) {
  const { user, setUser } = useSession();
  const router = useRouter();
  if (!user) return null;

  const initials = (user.name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.post("/api/auth/logout");
      setUser(null);
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 rounded-[6px] px-1 py-1.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline-2 bg-surface-3 text-[10px] font-semibold text-ink-2">
        {initials || "T"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] text-ink">{user.name || "Trader"}</div>
        <div className="truncate text-[10px] text-ink-4">{user.email}</div>
      </div>
      <button
        onClick={signOut}
        disabled={signingOut}
        className="p-1.5 text-ink-4 transition-colors hover:text-ink-2 disabled:opacity-40"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="size-3.5" strokeWidth={1.8} />
      </button>
    </div>
  );
}
