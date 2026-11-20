import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Btn, Card, adminInput } from "@/components/admin/ui";
import { ReportSkeleton } from "@/components/ui/loading-rows";
import { formatPrice, brand, CURRENCY, LOCALE } from "@/config/brand";
import { api } from "@/lib/api";
import { downloadTextFile } from "@/lib/csv";
import { useFeatures } from "@/lib/features";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({ meta: [{ title: `Reports — ${brand.name} Admin` }] }),
  component: ReportsPage,
});

type Line = { name: string; orders?: number; qty?: number; revenue: number };
type Report = {
  from: string; to: string; channel: string; channels: { name: string; orders: number; revenue: number }[];
  summary: { orders: number; revenue: number; average: number; units: number; discounts: number; shipping: number; refundedOrders: number; refundedAmount: number; cancelled: number; newCustomers: number; returns: number };
  days: { date: string; orders: number; revenue: number }[];
  products: Line[]; categories: Line[]; states: Line[]; payments: Line[];
  customers: { name: string; email: string; orders: number; spent: number }[];
};

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));
const PRESETS: { label: string; from: () => string }[] = [
  { label: "7 days", from: () => daysAgo(6) },
  { label: "30 days", from: () => daysAgo(29) },
  { label: "90 days", from: () => daysAgo(89) },
  { label: "This year", from: () => `${new Date().getFullYear()}-01-01` },
];
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

function ReportsPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(iso(new Date()));
  const { offlineShop } = useFeatures();
  const [channel, setChannel] = useState<"all" | "online" | "shop">("all");
  const q = useQuery({ queryKey: ["admin", "reports", from, to, channel], queryFn: () => api<Report>(`/admin/reports?from=${from}&to=${to}&channel=${channel}`), placeholderData: (p) => p });

  function exportCsv() {
    const r = q.data;
    if (!r) return;
    const rows: (string | number)[][] = [
      [`${brand.name} sales report`, `${r.from} to ${r.to}`], [],
      ["Summary"], ["Orders", r.summary.orders], [`Sales (${CURRENCY})`, r.summary.revenue], [`Average order (${CURRENCY})`, r.summary.average], ["Pieces sold", r.summary.units],
      [`Discounts given (${CURRENCY})`, r.summary.discounts], [`Shipping charged (${CURRENCY})`, r.summary.shipping], ["Refunded orders", r.summary.refundedOrders], [`Refunded (${CURRENCY})`, r.summary.refundedAmount],
      ["Cancelled orders", r.summary.cancelled], ["New customers", r.summary.newCustomers], ["Return requests", r.summary.returns], [],
      ["Channel", "Orders", `Sales (${CURRENCY})`], ...r.channels.map((c) => [c.name, c.orders, c.revenue]), [],
      ["Day", "Orders", `Sales (${CURRENCY})`], ...r.days.map((d) => [d.date, d.orders, d.revenue]), [],
      ["Product", "Pieces", `Sales (${CURRENCY})`], ...r.products.map((p) => [p.name, p.qty ?? 0, p.revenue]), [],
      ["Category", "Pieces", `Sales (${CURRENCY})`], ...r.categories.map((p) => [p.name, p.qty ?? 0, p.revenue]), [],
      ["Customer", "E-mail", "Orders", `Spent (${CURRENCY})`], ...r.customers.map((c) => [c.name, c.email, c.orders, c.spent]), [],
      ["State", "Orders", `Sales (${CURRENCY})`], ...r.states.map((s) => [s.name, s.orders ?? 0, s.revenue]),
    ];
    downloadTextFile(`shop-report-${r.from}-to-${r.to}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
  }

  const r = q.data;
  const s = r?.summary;
  return (
    <AdminShell title="Reports" actions={<Btn onClick={exportCsv} disabled={!r}><Download className="size-3.5" /> Export CSV</Btn>}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-[13px]"><span className="block font-medium">From</span><input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${adminInput} mt-1`} /></label>
        <label className="text-[13px]"><span className="block font-medium">To</span><input type="date" value={to} min={from} max={iso(new Date())} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${adminInput} mt-1`} /></label>
        {offlineShop ? <label className="text-[13px]"><span className="block font-medium">Sales from</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className={`${adminInput} mt-1`}><option value="all">Online and shop</option><option value="online">Online only</option><option value="shop">Shop only</option></select></label> : null}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => <Btn key={p.label} onClick={() => { setFrom(p.from()); setTo(iso(new Date())); }}>{p.label}</Btn>)}
        </div>
      </div>

      {!r ? (
        <ReportSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Sales", formatPrice(s!.revenue)], ["Orders", String(s!.orders)], ["Average order", formatPrice(s!.average)], ["Pieces sold", String(s!.units)],
              ["Discounts given", formatPrice(s!.discounts)], ["Refunded", `${s!.refundedOrders} · ${formatPrice(s!.refundedAmount)}`], ["Cancelled orders", String(s!.cancelled)], ["New customers", String(s!.newCustomers)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[12px] border border-[#e3e3e3] bg-white p-3.5">
                <p className="text-xs text-[#616161]">{label}</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
              </div>
            ))}
          </div>

          {r.channels.length ? <div className="grid grid-cols-2 gap-3">
            {r.channels.map((c) => (
              <div key={c.name} className="rounded-[12px] border border-[#e3e3e3] bg-white p-3.5">
                <p className="text-xs text-[#616161]">{c.name} sales</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">{formatPrice(c.revenue)}</p>
                <p className="text-xs text-[#616161]">{c.orders} order{c.orders === 1 ? "" : "s"}</p>
              </div>
            ))}
          </div> : null}

          <Card title="Sales by day"><DayChart days={r.days} /></Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="Top products" head={["Product", "Pieces", "Sales"]} rows={r.products.map((p) => [p.name, String(p.qty ?? 0), formatPrice(p.revenue)])} />
            <Table title="By category" head={["Category", "Pieces", "Sales"]} rows={r.categories.map((p) => [p.name, String(p.qty ?? 0), formatPrice(p.revenue)])} />
            <Table title="Top customers" head={["Customer", "Orders", "Spent"]} rows={r.customers.map((c) => [`${c.name} (${c.email})`, String(c.orders), formatPrice(c.spent)])} />
            <Table title="By state" head={["State", "Orders", "Sales"]} rows={r.states.map((p) => [p.name, String(p.orders ?? 0), formatPrice(p.revenue)])} />
            <Table title="Payment method" head={["Method", "Orders", "Sales"]} rows={r.payments.map((p) => [p.name, String(p.orders ?? 0), formatPrice(p.revenue)])} />
          </div>
          <p className="text-xs text-[#616161]">Dates follow India time. Cancelled orders are never counted as sales. Return requests in this period: {s!.returns}.</p>
        </div>
      )}
    </AdminShell>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <Card title={title} flush>
      {rows.length === 0 ? (
        <p className="px-4 pb-5 pt-2 text-[13px] text-[#616161]">Nothing in this period.</p>
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead><tr>{head.map((h, i) => <th key={h} className={`px-4 py-2 font-medium text-[#616161] ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, n) => (
              <tr key={n} className="border-t border-[#ebebeb]">{row.map((cell, i) => <td key={i} className={`px-4 py-2 ${i ? "text-right tabular-nums" : "max-w-[18rem] truncate"}`}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** One ink colour, thin bars, hover tooltip. Long ranges are grouped so bars stay readable. */
function DayChart({ days }: { days: Report["days"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
  const step = Math.ceil(days.length / 60);
  const bars: { from: string; to: string; revenue: number; orders: number }[] = [];
  for (let i = 0; i < days.length; i += step) {
    const g = days.slice(i, i + step);
    bars.push({ from: g[0]!.date, to: g[g.length - 1]!.date, revenue: g.reduce((a, d) => a + d.revenue, 0), orders: g.reduce((a, d) => a + d.orders, 0) });
  }
  const max = Math.max(1, ...bars.map((b) => b.revenue));
  if (bars.every((b) => b.revenue === 0)) return <p className="py-10 text-center text-[13px] text-[#616161]">No sales in this period.</p>;
  return (
    <div>
      <div className="relative flex h-44 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {bars.map((b, i) => (
          <div key={b.from} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div className={`w-full rounded-t-[3px] ${hover === i ? "bg-[#005bd3]" : "bg-[#5c5c5c]"}`} style={{ height: `${Math.max(b.revenue > 0 ? 3 : 1, Math.round((b.revenue / max) * 100))}%` }} />
            {hover === i ? (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#303030] px-2.5 py-1.5 text-xs text-white shadow">
                <p className="font-semibold">{formatPrice(b.revenue)}</p>
                <p className="text-white/70">{b.from === b.to ? label(b.from) : `${label(b.from)} – ${label(b.to)}`} · {b.orders} order{b.orders === 1 ? "" : "s"}</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-[#616161]"><span>{label(days[0]!.date)}</span><span>{label(days[days.length - 1]!.date)}</span></div>
    </div>
  );
}
