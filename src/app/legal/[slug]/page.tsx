import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const CONTENT: Record<string, { title: string; updated: string; sections: { heading: string; body: string[] }[] }> = {
  terms: {
    title: "Terms of Service",
    updated: "2026-01-01",
    sections: [
      {
        heading: "1. What TRADIA AI is",
        body: [
          "TRADIA AI is a market-analysis and trading-education tool. It computes technical analysis from market data, presents potential trade scenarios, and provides position-sizing and journaling utilities.",
          "TRADIA AI is not a broker, dealer, investment adviser, portfolio manager or signal service. It does not execute trades, hold client funds, or manage accounts on your behalf.",
        ],
      },
      {
        heading: "2. No advice, no guarantees",
        body: [
          "Nothing produced by TRADIA AI constitutes investment advice, a recommendation, or a solicitation to buy or sell any instrument. Analysis outputs are informational and educational.",
          "TRADIA AI does not guarantee trading results, accuracy, profitability, or the suitability of any setup for your circumstances. Confidence figures are estimates of confluence in the analysis, not probabilities of profit.",
        ],
      },
      {
        heading: "3. Your responsibility",
        body: [
          "All trading decisions are yours. You are responsible for verifying any price, level or figure before acting on it, and for complying with the laws and regulations that apply to you.",
          "Trading and leveraged products involve substantial risk of loss and are not suitable for everyone. Never risk capital you cannot afford to lose.",
        ],
      },
      {
        heading: "4. Data and availability",
        body: [
          "Market data may be delayed, incomplete, or simulated (demo) data used for product evaluation. Every screen displaying prices indicates its data source.",
          "The service is provided on an as-is basis. We do not warrant uninterrupted availability and may change or withdraw features.",
        ],
      },
      {
        heading: "5. Accounts",
        body: [
          "You are responsible for keeping your credentials secure and for all activity under your account. Notify us promptly of any unauthorised use.",
          "We may suspend accounts that abuse the service, attempt to circumvent plan limits, or use the product unlawfully.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updated: "2026-01-01",
    sections: [
      {
        heading: "Data we store",
        body: [
          "Account data: email address, display name, and a salted scrypt password hash. We never store plaintext passwords.",
          "Product data you create: preferences, watchlist, risk defaults, paper positions, journal entries, alert rules and chat history.",
          "Usage data: daily counters for plan limit enforcement (AI analyses, scans, copilot messages).",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To operate your workspace: personalising analysis depth, scanner universe and position-size defaults.",
          "To enforce plan limits and prevent abuse.",
          "To produce journal and portfolio analysis scoped strictly to your own records.",
        ],
      },
      {
        heading: "What we do not do",
        body: [
          "We do not sell your data. We do not share your journal, positions or chat with other users.",
          "Market analysis is computed per request and cached in memory for a short period; the cache is not keyed to your identity.",
        ],
      },
      {
        heading: "Security",
        body: [
          "Sessions use httpOnly, SameSite cookies. Only a SHA-256 hash of each session token is persisted, so a database leak does not expose live sessions.",
          "API credentials for market-data and AI providers are read server-side only and are never included in client bundles.",
        ],
      },
      {
        heading: "Your controls",
        body: [
          "You can edit or delete journal entries and paper positions at any time, clear chat history, and change your preferences.",
          "Deleting your account removes associated product data. Contact support to request deletion in this deployment.",
        ],
      },
    ],
  },
  risk: {
    title: "Risk Disclosure",
    updated: "2026-01-01",
    sections: [
      {
        heading: "Trading risk",
        body: [
          "Trading financial instruments involves a high degree of risk. You can lose more than your initial deposit where leverage is used. Past performance — including simulated performance — is not indicative of future results.",
          "TRADIA AI's analysis reduces ambiguity about what the market is doing; it does not reduce the risk of being wrong.",
        ],
      },
      {
        heading: "Paper trading limitations",
        body: [
          "Paper trading does not replicate live execution: there is no slippage, no partial fills, no financing or borrow costs, and no psychological pressure from real capital at risk. Simulated results are systematically optimistic.",
          "Paper and real performance are kept strictly separate in the product and must never be compared directly when judging a strategy.",
        ],
      },
      {
        heading: "AI limitations",
        body: [
          "The analysis engine is deterministic and rule-based, computed from price, volume and derived indicators. It does not know about news, sentiment, order-book depth, funding, or events outside the connected data.",
          "When data is unavailable, the product says so rather than estimating. Treat every confidence figure as a measure of confluence, never as a probability.",
        ],
      },
      {
        heading: "Data limitations",
        body: [
          "Prices may be delayed or simulated. Demo data is clearly labelled throughout the product and must not be used to make real trading decisions.",
          "Support and resistance levels are statistical clusters of swing pivots — they are reference points, not barriers.",
        ],
      },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(CONTENT).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = CONTENT[slug];
  return { title: doc ? `${doc.title} — TRADIA AI` : "TRADIA AI" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = CONTENT[slug];
  if (!doc) notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-accent-ink">
              T
            </span>
            <span className="text-[12.5px] font-semibold tracking-[0.08em]">TRADIA AI</span>
          </Link>
          <Link href="/" className="text-[11.5px] text-ink-3 hover:text-ink">
            Back
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="eyebrow">Legal</div>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em]">{doc.title}</h1>
        <p className="mt-1 text-[11px] text-ink-4">Last updated {doc.updated}</p>

        <div className="mt-7 space-y-6">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-[13.5px] font-semibold text-ink">{section.heading}</h2>
              <div className="mt-2 space-y-2">
                {section.body.map((p, i) => (
                  <p key={i} className="text-[12px] leading-relaxed text-ink-2">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-9 flex gap-4 border-t border-hairline pt-4 text-[11px]">
          <Link href="/legal/terms" className="text-ink-3 hover:text-ink">Terms</Link>
          <Link href="/legal/privacy" className="text-ink-3 hover:text-ink">Privacy</Link>
          <Link href="/legal/risk" className="text-ink-3 hover:text-ink">Risk disclosure</Link>
        </div>
      </div>
    </div>
  );
}
