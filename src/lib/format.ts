import { requireInstrument } from "./instruments";

/** Format a price with the instrument's precision. */
export function fmtPrice(value: number | null | undefined, symbol?: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const precision = symbol ? requireInstrument(symbol).precision : value < 10 ? 3 : 2;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

export function fmtMoney(value: number | null | undefined, opts?: { sign?: boolean; compact?: boolean; currency?: string }): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const currency = opts?.currency ?? "USD";
  const abs = Math.abs(value);
  const sign = opts?.sign ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : "";
  if (opts?.compact && abs >= 1000) {
    const units = [
      { v: 1e9, s: "B" },
      { v: 1e6, s: "M" },
      { v: 1e3, s: "K" },
    ];
    for (const u of units) {
      if (abs >= u.v) {
        return `${sign}$${(abs / u.v).toFixed(abs / u.v >= 100 ? 0 : 1)}${u.s}`;
      }
    }
  }
  const str = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${sign}${symbol}${str}`;
}

export function fmtPct(value: number | null | undefined, opts?: { sign?: boolean; digits?: number }): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = opts?.digits ?? 2;
  const sign = opts?.sign ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function fmtNum(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtQty(value: number | null | undefined, symbol?: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const unit = symbol ? requireInstrument(symbol).unitLabel : "";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 2 : abs >= 1 ? 3 : 5;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function fmtTimeAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtUtcClock(ts: number): string {
  return `${new Date(ts).toISOString().slice(11, 19)} UTC`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(value * f) / f;
}
