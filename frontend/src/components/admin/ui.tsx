import { CURRENCY, LOCALE } from "@/config/brand";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small Shopify-admin-style building blocks: white rounded cards on a light grey
 * canvas, soft badges, compact buttons. Used by the new admin pages.
 */

export function Card({
  title,
  actions,
  children,
  className,
  flush = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding (for tables that run edge to edge). */
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-[12px] border border-[#e3e3e3] bg-white shadow-[0_1px_0_rgba(26,26,26,0.07)]", className)}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 px-4 pb-0 pt-4">
          <h2 className="text-[13px] font-semibold text-[#303030]">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className={flush ? "pt-3" : "p-4"}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "success" | "attention" | "critical" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-[#e3e3e3] text-[#303030]",
  success: "bg-[#cdfee1] text-[#0c5132]",
  attention: "bg-[#ffea8a] text-[#4f4700]",
  critical: "bg-[#fed3d1] text-[#8e1f0b]",
  info: "bg-[#a4e8f2] text-[#00424d]",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Btn({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "plain" }) {
  const styles = {
    primary: "bg-[#303030] text-white hover:bg-[#1a1a1a] border-transparent",
    secondary: "bg-white text-[#303030] border-[#c9c9c9] hover:bg-[#f7f7f7]",
    danger: "bg-white text-[#8e1f0b] border-[#c9c9c9] hover:bg-[#fff4f4]",
    plain: "bg-transparent text-[#005bd3] border-transparent hover:underline",
  };
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
    />
  );
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block text-[13px] text-[#303030]">
      <span className="font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {help ? <span className="mt-1 block text-xs text-[#616161]">{help}</span> : null}
    </label>
  );
}

export const adminInput =
  "w-full rounded-lg border border-[#8a8a8a] bg-white px-3 py-2 text-[13px] text-[#303030] focus:border-[#005bd3] focus:outline-none focus:ring-2 focus:ring-[#005bd3]/30";

export function money(value: number): string {
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  return `${CURRENCY}${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(value)}`;
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function paymentBadge(status: string) {
  if (status === "paid") return <Badge tone="success">Paid</Badge>;
  if (status === "failed") return <Badge tone="critical">Failed</Badge>;
  if (status === "refunded") return <Badge>Refunded</Badge>;
  return <Badge tone="attention">Payment pending</Badge>;
}

export function fulfilmentBadge(status: string, orderStatus?: string) {
  if (orderStatus === "cancelled") return <Badge tone="critical">Cancelled</Badge>;
  return status === "fulfilled" ? <Badge tone="success">Fulfilled</Badge> : <Badge tone="attention">Unfulfilled</Badge>;
}

/** Compact square icon button for table rows (edit, delete, download…). The label becomes the tooltip. */
export function IconBtn({
  icon: Icon,
  label,
  tone = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md border border-transparent text-[#616161] transition-colors hover:bg-[#f1f1f1] hover:text-[#303030] disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger" && "hover:bg-[#fff4f4] hover:text-[#8e1f0b]",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** Class string so a router <Link> can look exactly like an IconBtn. */
export const iconLinkClass =
  "inline-flex size-7 items-center justify-center rounded-md border border-transparent text-[#616161] transition-colors hover:bg-[#f1f1f1] hover:text-[#303030]";
