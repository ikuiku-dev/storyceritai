"use client";
import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/* ─────────── Card ─────────── */
export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <As className={`card ${className}`}>{children}</As>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b hairline px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-ink-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ─────────── Button ─────────── */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-ink-300",
  secondary: "bg-white text-ink-800 border hairline hover:bg-ink-100 disabled:text-ink-400",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-danger-500 text-white hover:opacity-90",
};
const SIZES: Record<Size, string> = { sm: "h-8 px-3 text-[13px]", md: "h-9.5 px-4 text-sm" };

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "secondary", size = "md", children }: { href: string; variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ${VARIANTS[variant]} ${SIZES[size]}`}>
      {children}
    </Link>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-3.5 w-3.5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ─────────── Form fields ─────────── */
const fieldBase =
  "w-full rounded-lg border hairline bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 disabled:bg-ink-100";

export function Field({ label, hint, error, required, children, id }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode; id?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-700">
        {label} {required && <span className="text-danger-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs leading-snug text-ink-500">{hint}</p>}
      {error && <p className="text-xs leading-snug text-danger-500">{error}</p>}
    </div>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${fieldBase} h-9.5 ${p.className ?? ""}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${fieldBase} h-9.5 ${p.className ?? ""}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`${fieldBase} py-2 leading-relaxed ${p.className ?? ""}`} />;

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm text-ink-800">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5.5 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-brand-500" : "bg-ink-300"}`}
      >
        <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

/* ─────────── Status ─────────── */
export type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "violet";
const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-600 ring-ink-200",
  green: "bg-brand-50 text-brand-700 ring-brand-100",
  amber: "bg-warn-100 text-amber-soft ring-[#f5e3c0]",
  red: "bg-danger-100 text-danger-500 ring-[#f6d4d2]",
  blue: "bg-[#eaf1fb] text-[#2b5fa8] ring-[#d5e2f5]",
  violet: "bg-[#f1edfb] text-[#5b45a8] ring-[#e2daf6]",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Callout({ tone = "neutral", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const bg = tone === "amber" ? "bg-warn-100/70 border-[#f0dcc0]" : tone === "red" ? "bg-danger-100/70 border-[#f2cfcd]" : tone === "green" ? "bg-brand-50 border-brand-100" : tone === "blue" ? "bg-[#eaf1fb]/70 border-[#d5e2f5]" : "bg-ink-100/70 border-ink-200";
  return (
    <div className={`rounded-xl border px-4 py-3 text-[13px] leading-relaxed text-ink-700 ${bg}`}>
      {title && <p className="mb-0.5 font-semibold text-ink-900">{title}</p>}
      {children}
    </div>
  );
}

/* ─────────── Empty state ─────────── */
export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-ink-800">{title}</h3>
      <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ─────────── Stat ─────────── */
export function Stat({ label, value, sub, tone, hint }: { label: string; value: ReactNode; sub?: string; tone?: Tone; hint?: string }) {
  return (
    <div className="card p-4" title={hint}>
      <p className="text-[12px] font-medium uppercase tracking-[0.04em] text-ink-500">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="mono text-[22px] font-semibold leading-none text-ink-900">{value}</span>
        {tone && tone !== "neutral" && <Badge tone={tone}>{tone === "green" ? "live" : tone === "red" ? "error" : tone}</Badge>}
      </div>
      {sub && <p className="mt-1.5 text-xs leading-snug text-ink-500">{sub}</p>}
    </div>
  );
}

/* ─────────── Page header ─────────── */
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/* ─────────── Table ─────────── */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b hairline text-left">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-5 py-2.5 text-[12px] font-medium uppercase tracking-[0.03em] text-ink-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`px-5 py-3 align-middle text-[13.5px] text-ink-700 ${className}`}>{children}</td>;
