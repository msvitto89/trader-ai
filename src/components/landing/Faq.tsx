"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

const ITEMS = [
  {
    q: "Is this real market data?",
    a: "No. This build runs on a deterministic demo feed so the product can be evaluated end to end. Every screen that shows a price carries a DEMO DATA badge and a timestamp. The market-data layer is a swappable provider interface, so a live feed slots in without touching the UI — and until it does, nothing is presented as real-time.",
  },
  {
    q: "Does the AI place trades for me?",
    a: "Never. TRADIA AI does not connect to a broker, hold funds, or execute anything. It reads structure, proposes potential setups, sizes the risk, and tells you where the idea would be invalidated. You decide, and paper trading lets you rehearse that decision without capital.",
  },
  {
    q: "Is my data safe?",
    a: "Passwords are hashed with scrypt and a per-user salt. Sessions are opaque 256-bit tokens stored httpOnly, and only a SHA-256 hash of the token is kept server-side, so a database leak does not hand over live sessions. Analysis runs against your own journal only. No provider credentials ever reach the browser.",
  },
  {
    q: "Can I trust a confidence score?",
    a: "Treat it as a confluence estimate, not a probability. The engine bounds it between 22 and 79 precisely so it never reads like a certainty, and it cannot claim high quality inside a ranging or high-volatility regime. Every setup must also carry a stop and at least three invalidation conditions.",
  },
  {
    q: "What is the difference between Free and Pro?",
    a: "Free covers the entire loop — analyse, scan, size, paper trade, journal — with daily limits and a four-timeframe view. Pro removes the ceilings: unlimited analyses and scans, all seven timeframes, the full scanner universe, advanced journal and portfolio analytics, and more alerts. Billing in this build is a demo flow that flips entitlements so the Pro experience can be evaluated.",
  },
];

/**
 * Accordion using the grid-template-rows 0fr → 1fr technique. Unlike
 * max-height, it animates to the content's true height, so there is no jump and
 * no arbitrary magic number.
 */
export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="px-6 py-32">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-12 text-center text-4xl font-semibold tracking-tight text-white md:text-5xl">
          We&apos;ve got answers
        </h2>

        <div className="rounded-xl border border-white/10 bg-transparent">
          {ITEMS.map((item, index) => {
            const open = openIndex === index;
            return (
              <div
                key={item.q}
                className={
                  index < ITEMS.length - 1 ? "border-b border-white/10" : ""
                }
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : index)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-6 px-6 py-6 text-left"
                >
                  <span className="text-base font-medium text-white">
                    {item.q}
                  </span>
                  <Plus
                    className={`size-4 shrink-0 text-gray-400 transition-transform duration-300 ${
                      open ? "rotate-45" : "rotate-0"
                    }`}
                  />
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-400 ease-out"
                  style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-6 text-sm leading-relaxed text-gray-400">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
