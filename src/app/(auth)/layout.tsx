import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { describeMarketData } from "@/lib/market-data";
import { DemoBadge } from "@/components/ui";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardedAt ? "/app" : "/onboarding");
  const data = describeMarketData();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Left: brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-hairline p-8 lg:flex">
        <div className="pointer-events-none absolute inset-0 grid-texture opacity-50" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accent/[0.06] blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-accent-ink">
            T
          </span>
          <span className="text-[13px] font-semibold tracking-[0.08em]">
            TRADIA <span className="text-accent">AI</span>
          </span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.022em]">
            The part of trading that actually compounds is the discipline.
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
            TRADIA AI reads the market across seven timeframes, shows you where a setup breaks, and
            sizes the risk before you commit. Then it helps you review what you actually did.
          </p>
          <ul className="mt-6 space-y-2.5 text-[12px] text-ink-2">
            {[
              "Multi-timeframe analysis with an explanation you can argue with",
              "Position sizing and portfolio heat before every trade",
              "Paper trading kept strictly separate from real performance",
              "Journal insights that respect sample size",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[10px] leading-relaxed text-ink-4">
          Market analysis and educational information only. Not investment advice. No guarantee of
          trading results.
        </p>
      </div>

      {/* Right: form */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-accent-ink">
              T
            </span>
            <span className="text-[12.5px] font-semibold tracking-[0.08em]">TRADIA AI</span>
          </Link>
          {data.source === "demo" && <DemoBadge source="demo" />}
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-[368px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
