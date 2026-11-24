"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo, LogoMark } from "./Logo";
import { FadeInUp, RevealWords } from "./reveal";
import { DISCLAIMER_LONG } from "@/lib/constants";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Analyst", href: "#product" },
      { label: "How it works", href: "#how" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of service", href: "/legal/terms" },
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Risk disclosure", href: "/legal/risk" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/register" },
      { label: "Workspace", href: "/app" },
    ],
  },
];

export function Footer() {
  return (
    <footer id="contact" className="relative z-0 overflow-hidden border-t border-white/[0.05] px-6 pb-10 pt-32">
      {/* Deep, quiet video bed. Heavily overlaid so link text never competes. */}
      <video
        className="absolute inset-0 -z-10 size-full object-cover opacity-25"
        src="https://cdn.sceneai.art/Hero%20Section%20Video/50b4f304-cdca-4e12-8735-580d225834be.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="none"
        aria-hidden
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black via-black/85 to-black" />

      <div className="mx-auto max-w-7xl">
        {/* CTA */}
        <div className="mb-32 text-center">
          <RevealWords
            as="h2"
            text="Understand the market"
            accent="completely."
            accentClassName="inline-block font-serif font-normal italic text-gray-300"
            className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl"
          />
          <FadeInUp delay={0.35} className="mx-auto max-w-xl">
            <p className="mt-5 text-[15px] leading-relaxed text-gray-400">
              Two minutes to set your markets, style and risk defaults. Then
              analyse your first instrument with the evidence in front of you.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[13.5px] font-semibold text-black transition-transform duration-200 hover:scale-[1.02]"
              >
                Get started
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href="#product"
                className="rounded-full border border-white/10 bg-[#1F1F22] px-6 py-3.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
              >
                See the product
              </Link>
            </div>
          </FadeInUp>
        </div>

        {/* Link grid */}
        <div className="mb-16 grid grid-cols-1 gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[12.5px] leading-relaxed text-gray-400">
              Speed, structure and risk discipline — in one workspace. Analysis
              and education, never advice.
            </p>
            <div className="mt-5 flex items-center gap-2 text-[11px] text-gray-600">
              <span className="size-1.5 rounded-full bg-emerald-400/70" />
              Demo feed active
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                {column.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) =>
                  link.href.startsWith("#") ? (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-[13px] text-gray-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[13px] text-gray-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>

        {/* Disclaimer — the required string, given real space */}
        <div className="mb-8 rounded-xl border border-white/[0.06] bg-white/[0.015] px-5 py-4">
          <p className="text-[11px] leading-relaxed text-gray-500">
            {DISCLAIMER_LONG}
          </p>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/[0.05] pt-8 text-[11.5px] text-gray-500 md:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark className="size-3.5 text-gray-600" />
            <span>© {new Date().getFullYear()} TRADIA AI. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Not investment advice</span>
            <span className="text-gray-700">·</span>
            <Link href="/legal/terms" className="transition-colors hover:text-gray-300">
              Terms
            </Link>
            <span className="text-gray-700">·</span>
            <Link href="/legal/risk" className="transition-colors hover:text-gray-300">
              Risk
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
