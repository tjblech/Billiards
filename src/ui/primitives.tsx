import React, { useEffect, useRef, useState } from "react";
import type { MatchStatus } from "../lib/tournament";

/* ==========================================================================
   Primitives. Flat, bordered, square-ish. No component here owns colour
   except through the three signal tokens (go / live / greyscale).
   ========================================================================== */

/* --- Eight ball mark ------------------------------------------------------ */
export function EightBall({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <circle cx="16" cy="16" r="15" fill="#0d0d10" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <circle cx="16" cy="16" r="8.4" fill="#ececed" />
      <text
        x="16"
        y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Barlow Condensed, sans-serif"
        fontSize="12"
        fontWeight="700"
        fill="#08080a"
      >
        8
      </text>
    </svg>
  );
}

/* --- Panel ---------------------------------------------------------------- */
export function Panel({
  children,
  className = "",
  flush = false,
  ticks = false,
}: {
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
  ticks?: boolean;
}) {
  return (
    <section className={`${flush ? "panel-flush" : "panel"} ${ticks ? "ticks" : ""} ${className}`}>
      {children}
    </section>
  );
}

/** Section header: mono eyebrow left, optional actions right, hairline under. */
export function PanelHead({
  label,
  hint,
  right,
  className = "",
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`flex min-h-[42px] items-center justify-between gap-3 border-b border-line px-3.5 ${className}`}
    >
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2 className="eyebrow !text-fg-2">{label}</h2>
        {hint ? <span className="truncate font-mono text-[10px] text-fg-4">{hint}</span> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
    </header>
  );
}

/* --- Button --------------------------------------------------------------- */
type BtnVariant = "primary" | "ghost" | "outline" | "live" | "bare";
type BtnSize = "xs" | "sm" | "md" | "lg";

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-go text-ink hover:bg-[#d4ff63] border border-go font-semibold",
  live: "bg-live text-white hover:bg-[#ff6152] border border-live font-semibold",
  outline: "bg-transparent text-fg border border-line-2 hover:border-line-3 hover:bg-panel-2",
  ghost: "bg-panel-2 text-fg border border-line hover:bg-panel-3 hover:border-line-2",
  bare: "bg-transparent text-fg-2 border border-transparent hover:text-fg hover:bg-panel-2",
};

const BTN_SIZE: Record<BtnSize, string> = {
  xs: "h-6 px-2 text-[11px] gap-1",
  sm: "h-8 px-2.5 text-[12px] gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-2",
  lg: "h-11 px-5 text-[14px] gap-2",
};

export function Btn({
  children,
  variant = "ghost",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  return (
    <button
      {...rest}
      className={`inline-flex select-none items-center justify-center rounded-[3px] uppercase tracking-[0.02em] transition-colors duration-100 disabled:pointer-events-none disabled:opacity-30 ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Icon-only button, square. */
export function IconBtn({
  children,
  label,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={`inline-grid h-8 w-8 place-items-center rounded-[3px] border border-line bg-panel-2 text-fg-2 transition-colors duration-100 hover:border-line-2 hover:text-fg disabled:pointer-events-none disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}

/* --- Segmented control ---------------------------------------------------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
  className?: string;
}) {
  const h = size === "sm" ? "h-7 text-[11px]" : "h-9 text-[12px]";
  return (
    <div
      role="tablist"
      className={`inline-grid rounded-[3px] border border-line bg-ink p-[3px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`${h} rounded-[2px] px-2.5 font-medium uppercase tracking-[0.04em] transition-colors duration-100 ${
              active ? "bg-go text-ink" : "text-fg-3 hover:text-fg"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* --- Stepper (table count) ------------------------------------------------ */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 6,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-[3px] border border-line bg-ink">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Fewer tables"
        className="h-full w-9 text-fg-3 transition-colors hover:text-fg disabled:opacity-25"
      >
        –
      </button>
      <span className="tnum w-9 text-center font-mono text-[13px] font-medium">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="More tables"
        className="h-full w-9 text-fg-3 transition-colors hover:text-fg disabled:opacity-25"
      >
        +
      </button>
    </div>
  );
}

/* --- Status ---------------------------------------------------------------- */
export const STATUS_META: Record<MatchStatus, { label: string; bar: string; chip: string }> = {
  inProgress: { label: "Live", bar: "var(--color-live)", chip: "bg-live text-white" },
  nextUp: { label: "Next Up", bar: "var(--color-go)", chip: "bg-go text-ink" },
  onDeck: { label: "On Deck", bar: "var(--color-deck)", chip: "bg-deck text-ink" },
  waiting: { label: "Waiting", bar: "transparent", chip: "bg-panel-3 text-fg-3" },
  finished: { label: "Final", bar: "rgba(255,255,255,0.14)", chip: "bg-panel-3 text-fg-3" },
};

export function StatusChip({ status, className = "" }: { status: MatchStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[2px] px-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.1em] ${meta.chip} ${className}`}
    >
      {status === "inProgress" ? (
        <span className="dot-live inline-block h-[5px] w-[5px] rounded-full bg-white" />
      ) : null}
      {meta.label}
    </span>
  );
}

/* --- Tag ------------------------------------------------------------------- */
export function Tag({
  children,
  tone = "muted",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "muted" | "go" | "live" | "outline";
  className?: string;
}) {
  const tones = {
    muted: "bg-panel-3 text-fg-2",
    go: "bg-go text-ink",
    live: "bg-live text-white",
    outline: "border border-line-2 text-fg-2",
  };
  return (
    <span
      className={`inline-flex h-[18px] items-center rounded-[2px] px-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.1em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* --- Stat readout ---------------------------------------------------------- */
export function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 border-r border-line px-3.5 py-2.5 last:border-r-0">
      <div className="eyebrow">{label}</div>
      <div
        className={`tnum mt-1 truncate font-display text-[19px] leading-none ${
          accent ? "text-go" : "text-fg"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* --- Empty state ----------------------------------------------------------- */
export function Empty({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-[3px] border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-fg-4 ${className}`}
    >
      {children}
    </div>
  );
}

/* --- Field ----------------------------------------------------------------- */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {hint ? <span className="font-mono text-[10px] text-fg-4">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

/* --- Toast-style inline message -------------------------------------------- */
export function Note({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className="mt-2.5 rounded-[3px] border px-3 py-2 text-[12px] leading-snug accent-l"
      style={
        tone === "ok"
          ? { borderColor: "rgba(198,255,61,0.24)", background: "rgba(198,255,61,0.05)", color: "#dcf7a5" }
          : { borderColor: "rgba(255,77,61,0.28)", background: "rgba(255,77,61,0.05)", color: "#ffc2ba" }
      }
    >
      {children}
    </div>
  );
}

/* --- Modal ----------------------------------------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 pt-[8vh]">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-rise panel relative w-full"
        style={{ maxWidth: `${width}px` }}
      >
        <PanelHead
          label={title}
          right={
            <IconBtn label="Close" onClick={onClose}>
              <span className="text-[14px] leading-none">×</span>
            </IconBtn>
          }
        />
        <div className="p-3.5">{children}</div>
      </div>
    </div>
  );
}

/* --- Live elapsed clock ---------------------------------------------------- */
export function useNow(active: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

export function formatElapsed(startedAt: string | null | undefined, now: number) {
  if (!startedAt) return "--:--";
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return "--:--";
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Fires a callback once when `key` changes — used for result flash highlights. */
export function useChangeFlash(key: string | number) {
  const [flash, setFlash] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 1100);
    return () => window.clearTimeout(id);
  }, [key]);
  return flash;
}

/* --- Copy-to-clipboard button ---------------------------------------------- */
export function CopyBtn({
  value,
  label = "Copy",
  size = "sm",
  variant = "ghost",
}: {
  value: string;
  label?: string;
  size?: BtnSize;
  variant?: BtnVariant;
}) {
  const [done, setDone] = useState(false);
  return (
    <Btn
      size={size}
      variant={variant}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setDone(true);
        window.setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? "Copied" : label}
    </Btn>
  );
}
