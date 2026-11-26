"use client";

import { cn } from "@/lib/cn";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

/* ─────────────────────────────────────────────────────────────
   Buttons
   ───────────────────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-[#e3b155] active:bg-[#c99a3c] border border-transparent font-semibold",
  secondary:
    "bg-surface-3 text-ink hover:bg-[#22262e] border border-hairline-2",
  ghost: "bg-transparent text-ink-2 hover:text-ink hover:bg-surface-2 border border-transparent",
  danger:
    "bg-bear-soft text-bear hover:bg-[#d2595c26] border border-[#d2595c33]",
  outline:
    "bg-transparent text-ink border border-hairline-2 hover:border-[#3a4049] hover:bg-surface-2",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] rounded-[6px] gap-1.5",
  md: "h-9.5 px-4 text-[13px] rounded-[7px] gap-2",
  lg: "h-11 px-5 text-[13.5px] rounded-[8px] gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 select-none",
        "disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && (
        <span
          aria-hidden
          className="size-3 rounded-full border-[1.5px] border-current border-t-transparent animate-spin"
        />
      )}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 select-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────
   Panels & structure
   ───────────────────────────────────────────────────────────── */

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  dense,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  dense?: boolean;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-4 pt-3.5 pb-3 border-b border-hairline">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold text-ink tracking-[-0.005em]">{title}</h2>}
            {subtitle && <p className="text-[11.5px] text-ink-3 mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(dense ? "" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
        {description && <p className="text-[12.5px] text-ink-2 mt-1 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Badges
   ───────────────────────────────────────────────────────────── */

type Tone = "neutral" | "bull" | "bear" | "accent" | "info" | "muted";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2 border-hairline-2",
  bull: "bg-bull-soft text-bull border-[#3fae8633]",
  bear: "bg-bear-soft text-bear border-[#d2595c33]",
  accent: "bg-accent-soft text-accent border-[#d7efff33]",
  info: "bg-[#6f9fd818] text-info border-[#6f9fd833]",
  muted: "bg-transparent text-ink-3 border-hairline",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function BiasBadge({ bias }: { bias: "bullish" | "bearish" | "neutral" }) {
  return (
    <Badge tone={bias === "bullish" ? "bull" : bias === "bearish" ? "bear" : "neutral"} dot>
      {bias}
    </Badge>
  );
}

export function DemoBadge({ source }: { source: "demo" | "live" }) {
  if (source === "demo") {
    return (
      <span
        title="Prices are simulated for product evaluation. Not live market data."
        className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#d7efff40] bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-accent"
      >
        <span className="size-1.5 rounded-full bg-accent" />
        Demo data
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#3fae8633] bg-bull-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-bull">
      <span className="size-1.5 rounded-full bg-bull live-dot" />
      Live data
    </span>
  );
}

export function QualityBadge({ quality }: { quality: "high" | "medium" | "low" }) {
  return (
    <Badge tone={quality === "high" ? "accent" : quality === "medium" ? "info" : "muted"}>
      {quality} quality
    </Badge>
  );
}

/* ─────────────────────────────────────────────────────────────
   Form controls
   ───────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  suffix,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  suffix?: string;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[11.5px] font-medium text-ink-2">{label}</span>
        {suffix && <span className="text-[10.5px] text-ink-4 tnum">{suffix}</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-[10.5px] text-ink-4 mt-1 leading-relaxed">{hint}</span>}
      {error && <span className="block text-[10.5px] text-bear mt-1">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full h-9.5 rounded-[7px] border border-hairline-2 bg-surface-2 px-2.5 text-[13px] text-ink placeholder:text-ink-4 focus:border-[#3d444e] focus:outline-none transition-colors tnum";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, className)} />;
}

export function NumericInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | string;
  onValueChange: (v: string) => void;
}) {
  return (
    <input
      {...props}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      inputMode="decimal"
      className={cn(inputClass, className)}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          inputClass,
          "appearance-none pr-8 cursor-pointer bg-surface-2",
          className,
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-2.5 text-ink-3"
      >
        <path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        {description && <div className="text-[11px] text-ink-3 mt-0.5 leading-relaxed">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-1 h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-surface-3 border border-hairline-2",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full transition-transform",
            checked ? "translate-x-[18px] bg-accent-ink" : "translate-x-0.5 bg-ink-3",
          )}
        />
      </button>
    </div>
  );
}

export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
  allowEmpty,
}: {
  options: { value: T; label: string; hint?: string; icon?: ReactNode }[];
  value: T[] | T | null;
  onChange: (v: T[] | T | null) => void;
  columns?: number;
  allowEmpty?: boolean;
}) {
  const multi = Array.isArray(value);
  const selected = multi ? value : value ? [value] : [];
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (multi) {
                if (active && allowEmpty) onChange(value.filter((v) => v !== opt.value));
                else if (active) return;
                else onChange([...(value as T[]), opt.value]);
              } else {
                onChange(allowEmpty && active ? null : opt.value);
              }
            }}
            className={cn(
              "group rounded-[8px] border px-3 py-2.5 text-left transition-colors",
              active
                ? "border-accent/60 bg-accent-soft"
                : "border-hairline-2 bg-surface-2 hover:border-[#3a4049]",
            )}
          >
            <span className="flex items-center gap-2">
              {opt.icon && <span className={cn("text-ink-3 group-hover:text-ink-2", active && "text-accent")}>{opt.icon}</span>}
              <span className={cn("text-[12.5px] font-medium", active ? "text-ink" : "text-ink-2")}>{opt.label}</span>
            </span>
            {opt.hint && <span className="block mt-0.5 text-[10.5px] text-ink-3 leading-snug">{opt.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Metrics & data display
   ───────────────────────────────────────────────────────────── */

export function Metric({
  label,
  value,
  delta,
  hint,
  tone,
  className,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  hint?: string;
  tone?: "default" | "bull" | "bear" | "accent";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const toneClass =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "accent" ? "text-accent" : "text-ink";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          "tnum font-medium tracking-[-0.015em] mt-1",
          size === "lg" ? "text-[26px] leading-8" : size === "sm" ? "text-[14px]" : "text-[17px] leading-6",
          toneClass,
        )}
      >
        {value}
      </div>
      {delta && <div className="text-[11px] text-ink-3 mt-0.5 tnum">{delta}</div>}
      {hint && <div className="text-[10.5px] text-ink-4 mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}

export function StatRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "bull" | "bear" | "muted";
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[#1a1e24] last:border-0">
      <span className="text-[11.5px] text-ink-3">{label}</span>
      <span
        className={cn(
          "text-[12.5px] tnum font-medium text-right",
          tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "muted" ? "text-ink-3" : "text-ink",
        )}
      >
        {value}
        {hint && <span className="block text-[10px] text-ink-4 font-normal">{hint}</span>}
      </span>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "accent",
  className,
  height = 5,
}: {
  /** 0..100 */
  value: number;
  tone?: "accent" | "bull" | "bear" | "info";
  className?: string;
  height?: number;
}) {
  const color =
    tone === "bull" ? "bg-bull" : tone === "bear" ? "bg-bear" : tone === "info" ? "bg-info" : "bg-accent";
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-surface-3", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", color)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tabs
   ───────────────────────────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-[7px] border border-hairline bg-surface-2 p-0.5", className)}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-[5px] font-medium transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed",
            size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]",
            value === opt.value ? "bg-surface-3 text-ink shadow-[0_1px_0_#00000040]" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-5 border-b border-hairline", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "relative -mb-px pb-2.5 pt-1 text-[12.5px] font-medium transition-colors",
            value === t.value ? "text-ink" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 text-[10.5px] text-ink-4 tnum">{t.count}</span>}
          {value === t.value && <span className="absolute inset-x-0 -bottom-px h-[1.5px] bg-accent" />}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Feedback
   ───────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      {icon && (
        <div className="mb-3 flex size-9 items-center justify-center rounded-[8px] border border-hairline-2 bg-surface-2 text-ink-3">
          {icon}
        </div>
      )}
      <h3 className="text-[13px] font-medium text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[11.5px] leading-relaxed text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    info: "border-[#6f9fd833] bg-[#6f9fd80f] text-[#a8c6e6]",
    warn: "border-[#d7efff33] bg-accent-soft text-[#e6c894]",
    danger: "border-[#d2595c33] bg-bear-soft text-[#e9a3a4]",
    success: "border-[#3fae8633] bg-bull-soft text-[#9fd8c2]",
  }[tone];
  return (
    <div className={cn("rounded-[7px] border px-3 py-2.5 text-[11.5px] leading-relaxed", styles)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {title && <div className="font-semibold mb-0.5">{title}</div>}
          <div className="opacity-90">{children}</div>
        </div>
        {action}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-[5px]", className)} />;
}

/* ─────────────────────────────────────────────────────────────
   Modal
   ───────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const maxW = width === "sm" ? "max-w-sm" : width === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={id}>
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />
      <div
        className={cn(
          "relative w-full sm:mx-4 rise max-h-[92vh] overflow-y-auto rounded-t-[14px] sm:rounded-[12px] border border-hairline-2 bg-surface shadow-2xl",
          maxW,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3.5 sticky top-0 bg-surface z-10">
          <div>
            <h2 id={id} className="text-[14px] font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[11.5px] text-ink-3 leading-relaxed">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink p-1 -m-1">
            <svg viewBox="0 0 16 16" className="size-3.5">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="p-4">{children}</div>
        {footer && <footer className="border-t border-hairline px-4 py-3 flex justify-end gap-2 sticky bottom-0 bg-surface">{footer}</footer>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Toasts
   ───────────────────────────────────────────────────────────── */

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}

const ToastCtx = createContext<{ push: (message: string, tone?: Toast["tone"]) => void }>({
  push: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-20 left-1/2 z-[60] w-[min(92vw,26rem)] -translate-x-1/2 space-y-2 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "rise rounded-[8px] border px-3 py-2.5 text-[12px] shadow-lg backdrop-blur",
              t.tone === "success"
                ? "border-[#3fae8640] bg-[#12211b] text-[#a9dcc8]"
                : t.tone === "error"
                  ? "border-[#d2595c40] bg-[#221315] text-[#ecb0b1]"
                  : "border-hairline-2 bg-surface-2 text-ink-2",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/* ─────────────────────────────────────────────────────────────
   Disclosure
   ───────────────────────────────────────────────────────────── */

export function Disclosure({
  summary,
  children,
  defaultOpen,
  icon,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-[12px] text-ink-2 hover:text-ink">
        <svg viewBox="0 0 12 12" className="size-2.5 text-ink-4 transition-transform group-open:rotate-90">
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {icon}
        {summary}
      </summary>
      <div className="pl-[18px] pb-2">{children}</div>
    </details>
  );
}

export function InfoHint({ text }: { text: string }) {
  return (
    <span className="group/hint relative inline-flex align-middle">
      <svg viewBox="0 0 16 16" className="size-3 text-ink-4 hover:text-ink-3" aria-label={text} role="img">
        <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 7v4M8 5.2v.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-52 -translate-x-1/2 rounded-[6px] border border-hairline-2 bg-surface-3 px-2 py-1.5 text-[10.5px] leading-snug text-ink-2 opacity-0 shadow-xl transition-opacity group-hover/hint:opacity-100">
        {text}
      </span>
    </span>
  );
}
