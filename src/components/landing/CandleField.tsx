"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

/**
 * CandleField — the hero's generative artwork.
 *
 * A live candlestick chart is the hero element itself. It is not a backdrop
 * image: the series ticks forward on an interval, every column morphs in
 * price space, and the whole field responds to the pointer.
 *
 * Pointer behaviour, in layers:
 *   pop     columns within reach scale and lift, driven by a --k intensity
 *           custom property rather than React state, so it stays at 60fps
 *   glitch  crossing into the inner ring fires a one-shot burst: RGB split,
 *           horizontal slice displacement and a skew wobble
 *   readout a floating OHLC card tracks the cursor, so the interaction
 *           answers with real numbers instead of decoration
 *
 * Price space is the field's own: prices are mapped to 0–100% of the
 * wrapper, so the chart is responsive without measuring anything.
 */

const COUNT = 62;
const TICK_MS = 1500;
const REACH = 150;

type Candle = { o: number; h: number; l: number; c: number };

/** Deterministic PRNG — the server and the client must render the same series. */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeries(seed: number, count: number): Candle[] {
  const rnd = mulberry32(seed);
  let price = 64200;
  const out: Candle[] = [];
  for (let i = 0; i < count; i += 1) {
    const o = price;
    const c = Math.max(1200, o + (rnd() - 0.47) * 430);
    const h = Math.max(o, c) + rnd() * 620;
    const l = Math.min(o, c) - rnd() * 620;
    out.push({ o, h, l, c });
    price = c;
  }
  return out;
}

const fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function CandleField() {
  const [data, setData] = useState<Candle[]>(() => buildSeries(20260124, COUNT));
  const [hover, setHover] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const colRefs = useRef<Array<HTMLDivElement | null>>([]);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const midRef = useRef<number[]>([]);
  const seedRef = useRef(20260124);
  const hoverRef = useRef<number | null>(null);

  /* ── price space ─────────────────────────────────────────────── */
  const bounds = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of data) {
      lo = Math.min(lo, c.l);
      hi = Math.max(hi, c.h);
    }
    const pad = (hi - lo) * 0.14 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }, [data]);

  const toY = (price: number) =>
    ((bounds.hi - price) / (bounds.hi - bounds.lo)) * 100;

  // Vertical centre of each body, kept in a ref so the pointer loop can read
  // it without re-binding its listeners on every tick.
  useEffect(() => {
    midRef.current = data.map((c) => (toY(c.o) + toY(c.c)) / 2);
    // toY is derived from bounds, which changes with data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, bounds]);

  /* ── live ticks ───────────────────────────────────────────────── */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setData((prev) => {
        const last = prev[prev.length - 1];
        seedRef.current = (seedRef.current * 1664525 + 1013904223) % 4294967296;
        const r = seedRef.current / 4294967296;
        const o = last.c;
        const c = Math.max(1200, o + (r - 0.47) * 430);
        const h = Math.max(o, c) + r * 620;
        const l = Math.min(o, c) - (1 - r) * 620;
        return [...prev.slice(1), { o, h, l, c }];
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  /* ── pointer engine ───────────────────────────────────────────── */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const glitchAt = new Float64Array(COUNT);
    const releaseTimers = new Map<number, number>();
    let raf = 0;
    let cx = -1e5;
    let cy = -1e5;

    const burst = (index: number, el: HTMLDivElement) => {
      el.classList.add("is-glitching");
      const prev = releaseTimers.get(index);
      if (prev) window.clearTimeout(prev);
      releaseTimers.set(
        index,
        window.setTimeout(() => {
          el.classList.remove("is-glitching");
          releaseTimers.delete(index);
        }, 460),
      );
    };

    const apply = () => {
      raf = 0;
      const rect = wrap.getBoundingClientRect();
      const outside =
        cx < rect.left - REACH ||
        cx > rect.right + REACH ||
        cy < rect.top - REACH ||
        cy > rect.bottom + REACH;
      if (outside) {
        for (let i = 0; i < COUNT; i += 1) {
          const el = colRefs.current[i];
          if (el) {
            el.style.setProperty("--k", "0");
            el.classList.remove("is-hot");
          }
        }
        if (readoutRef.current) readoutRef.current.style.opacity = "0";
        if (hoverRef.current !== null) {
          hoverRef.current = null;
          setHover(null);
        }
        return;
      }
      const width = rect.width;
      const now = performance.now();
      let nearest = -1;
      let nearestK = 0;

      for (let i = 0; i < COUNT; i += 1) {
        const el = colRefs.current[i];
        if (!el) continue;

        const midY = midRef.current[i];
        const x = rect.left + ((i + 0.5) / COUNT) * width;
        const y = rect.top + ((midY ?? 50) / 100) * rect.height;

        const dx = cx - x;
        const dy = (cy - y) * 0.62;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const raw = Math.max(0, 1 - dist / REACH);
        const k = raw * raw * (3 - 2 * raw); // smoothstep

        el.style.setProperty("--k", k.toFixed(3));
        el.classList.toggle("is-hot", k > 0.03);

        if (k > nearestK) {
          nearestK = k;
          nearest = i;
        }

        if (k > 0.46 && now > glitchAt[i]) {
          glitchAt[i] = now + 720;
          burst(i, el);
        }
      }

      // Readout follows the cursor, not the candle, so it never sits under
      // the pointer and blocks the next hit. It is clamped inside the field so
      // it cannot land on the copy above or the marquee below.
      if (readoutRef.current) {
        if (nearest >= 0 && nearestK > 0.12) {
          const CARD_W = 172;
          const CARD_H = 108;
          const localX = cx - rect.left + 26;
          const localY = cy - rect.top + 20;
          const x = Math.min(Math.max(8, localX), Math.max(8, rect.width - CARD_W));
          const y =
            localY + CARD_H > rect.height
              ? Math.max(4, cy - rect.top - CARD_H - 12)
              : localY;
          readoutRef.current.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
          readoutRef.current.style.opacity = String(Math.min(1, nearestK * 1.6));
        } else {
          readoutRef.current.style.opacity = "0";
        }
      }

      if (nearest !== hoverRef.current) {
        hoverRef.current = nearest >= 0 && nearestK > 0.12 ? nearest : null;
        setHover(hoverRef.current);
      }
    };

    const onMove = (event: PointerEvent) => {
      cx = event.clientX;
      cy = event.clientY;
      if (!raf) raf = window.requestAnimationFrame(apply);
    };

    const onDown = (event: PointerEvent) => {
      if (reduced) return;
      const rect = wrap.getBoundingClientRect();
      const width = rect.width;
      for (let i = 0; i < COUNT; i += 1) {
        const el = colRefs.current[i];
        if (!el) continue;
        const x = rect.left + ((i + 0.5) / COUNT) * width;
        if (Math.abs(event.clientX - x) < 34) burst(i, el);
      }
    };

    // Window-level tracking: the field sits behind the hero copy, so it must
    // never rely on its own hit area. Bounds come from the wrapper rect.
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      if (raf) window.cancelAnimationFrame(raf);
      releaseTimers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const setCol = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      colRefs.current[index] = el;
    },
    [],
  );

  const active = hover !== null ? data[hover] : null;
  const activeChange = active
    ? ((active.c - active.o) / active.o) * 100
    : 0;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Warm wash — light without a sun */}
      <div className="absolute left-1/2 top-[58%] size-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(215,239,255,0.10),rgba(215,239,255,0.03)_46%,transparent_72%)] blur-[24px]" />

      {/* Chart grid */}
      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0 1px, transparent 1px 13.5%)",
        }}
      />

      {/* A light band that sweeps the series, so the field breathes even when
          the pointer is elsewhere. */}
      <div className="candle-sweep" />

      {/* The candle field */}
      <div
        ref={wrapRef}
        className="candle-field absolute inset-x-0 bottom-0 top-[32%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_30%,black_100%)]"
      >
        {data.map((candle, index) => {
          const up = candle.c >= candle.o;
          const bodyTop = toY(Math.max(candle.o, candle.c));
          const bodyBottom = toY(Math.min(candle.o, candle.c));
          const h = Math.max(0.8, bodyBottom - bodyTop);

          return (
            <div
              key={index}
              ref={setCol(index)}
              className="candle-col"
              style={{
                left: `${((index + 0.5) / COUNT) * 100}%`,
                ["--i" as string]: index,
              } as CSSProperties}
              data-up={up ? "1" : "0"}
            >
              <div className="candle-glitch">
                <span
                  className="candle-wick"
                  style={{
                    top: `${toY(candle.h)}%`,
                    height: `${toY(candle.l) - toY(candle.h)}%`,
                  }}
                />
                <span
                  className="candle-body"
                  style={{ top: `${bodyTop}%`, height: `${h}%` }}
                >
                  <span className="candle-chroma candle-chroma--r" />
                  <span className="candle-chroma candle-chroma--c" />
                </span>
              </div>
            </div>
          );
        })}

        {/* Cursor readout */}
        <div
          ref={readoutRef}
          className="candle-readout"
          style={{ opacity: 0 }}
          aria-hidden
        >
          {active ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                  BTC/USD · 1H
                </span>
                <span
                  className={
                    activeChange >= 0
                      ? "text-[10px] font-semibold text-accent"
                      : "text-[10px] font-semibold text-white/45"
                  }
                >
                  {activeChange >= 0 ? "+" : ""}
                  {activeChange.toFixed(2)}%
                </span>
              </div>
              <div className="mt-1.5 font-mono text-[15px] font-medium tabular-nums text-white">
                {fmt.format(active.c)}
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[9.5px] tabular-nums text-white/40">
                <span>O {fmt.format(active.o)}</span>
                <span>H {fmt.format(active.h)}</span>
                <span>L {fmt.format(active.l)}</span>
                <span>C {fmt.format(active.c)}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
