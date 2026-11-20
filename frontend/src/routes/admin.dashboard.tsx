import { brand, LOCALE } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Btn, Card, money } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { adminStatsQuery } from "@/lib/admin";
import { flagsFromSettings } from "@/lib/commerce";
import { siteSettingsQuery } from "@/lib/site-settings";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: `Home — ${brand.name} Admin` }] }),
  component: Dashboard,
});

type Period = { orders: number; revenue: number };
type Dash = {
  today: Period; week: Period; month: Period; unfulfilled: number; paymentPending: number; customers: number;
  days: { date: string; orders: number; revenue: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  lowStock: { id: string; name: string; stock: number }[];
};

function Dashboard() {
  const dash = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api<Dash>("/admin/dashboard") });
  const stats = useQuery(adminStatsQuery());
  const settings = useQuery(siteSettingsQuery());
  const flags = flagsFromSettings(settings.data);
  const d = dash.data;
  const selling = flags.cart && flags.checkout;

  return (
    <AdminShell title="Home" actions={<Link to="/admin/products/new"><Btn variant="primary">Add product</Btn></Link>}>
      {!selling ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#e3e3e3] bg-white p-4">
          <div>
            <p className="text-[13px] font-semibold">Your store is in enquiry-only mode</p>
            <p className="mt-0.5 text-[13px] text-[#616161]">Customers browse and enquire on WhatsApp. Turn on the cart and checkout when you are ready to sell online.</p>
          </div>
          <Link to="/admin/commerce"><Btn>Store features</Btn></Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sales today" value={d ? money(d.today.revenue) : "–"} hint={d ? `${d.today.orders} order${d.today.orders === 1 ? "" : "s"}` : ""} />
        <Stat label="Last 7 days" value={d ? money(d.week.revenue) : "–"} hint={d ? `${d.week.orders} orders` : ""} />
        <Stat label="Last 30 days" value={d ? money(d.month.revenue) : "–"} hint={d ? `${d.month.orders} orders` : ""} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Sales over the last 14 days">
          {d ? <SalesChart days={d.days} /> : <div className="h-40 skel rounded-lg bg-[#ebebeb]" role="status" aria-label="Loading" />}
        </Card>

        <Card title="To do">
          <ul className="space-y-2 text-[13px]">
            <TodoRow to="/admin/orders" label="Orders to fulfil" value={d?.unfulfilled} tone="attention" />
            <TodoRow to="/admin/orders" label="Payments pending" value={d?.paymentPending} tone="attention" />
            <TodoRow to="/admin/customers" label="Customers" value={d?.customers} tone="neutral" />
          </ul>
          <h3 className="mb-2 mt-5 text-[13px] font-semibold">Low stock</h3>
          {d?.lowStock.length ? (
            <ul className="space-y-1.5 text-[13px]">
              {d.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <Link to="/admin/products/$id/edit" params={{ id: p.id }} className="truncate text-[#005bd3] hover:underline">{p.name}</Link>
                  <Badge tone={p.stock === 0 ? "critical" : "attention"}>{p.stock === 0 ? "Sold out" : `${p.stock} left`}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-[#616161]">Nothing is running low.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Top products (30 days)">
          {d?.topProducts.length ? (
            <ol className="space-y-2 text-[13px]">
              {d.topProducts.map((p, i) => (
                <li key={p.name} className="flex items-center justify-between gap-3">
                  <span className="truncate">{i + 1}. {p.name}</span>
                  <span className="shrink-0 text-[#616161]">{p.qty} sold · {money(p.revenue)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-[#616161]">No sales in this period yet.</p>
          )}
        </Card>

        <Card title="Catalogue">
          <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
            {[
              ["Products", stats.data?.total], ["Published", stats.data?.published], ["Drafts", stats.data?.draft],
              ["Featured", stats.data?.featured], ["New arrivals", stats.data?.newArrivals], ["Collections", stats.data?.collections],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-[#616161]">{label}</dt>
                <dd className="text-lg font-semibold">{value ?? "–"}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4 shadow-[0_1px_0_rgba(26,26,26,0.07)]">
      <p className="text-[13px] text-[#616161]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[#616161]">{hint}</p> : null}
    </div>
  );
}

function TodoRow({ to, label, value, tone }: { to: string; label: string; value: number | undefined; tone: "attention" | "neutral" }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[#f1f1f1]">
        <span>{label}</span>
        <Badge tone={value ? tone : "neutral"}>{value ?? "–"}</Badge>
      </Link>
    </li>
  );
}

/**
 * Single-series bar chart: one neutral ink colour (no legend needed for one series),
 * thin bars with a gap, today highlighted, hover tooltip, and a table for screen readers.
 */
function SalesChart({ days }: { days: Dash["days"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((x) => x.revenue));
  const total = days.reduce((s, x) => s + x.revenue, 0);
  const label = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

  if (total === 0) {
    return <p className="py-10 text-center text-[13px] text-[#616161]">No sales yet. Orders will appear here once checkout is on and customers start buying.</p>;
  }

  return (
    <div>
      <div className="relative flex h-44 items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {days.map((day, i) => {
          const h = Math.max(day.revenue > 0 ? 4 : 1, Math.round((day.revenue / max) * 100));
          const isToday = i === days.length - 1;
          return (
            <div key={day.date} className="group relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
              <div
                className={`w-full rounded-t-[4px] ${isToday ? "bg-[#303030]" : "bg-[#8a8a8a]"} ${hover === i ? "!bg-[#005bd3]" : ""}`}
                style={{ height: `${h}%` }}
              />
              {hover === i ? (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#303030] px-2.5 py-1.5 text-xs text-white shadow">
                  <p className="font-semibold">{money(day.revenue)}</p>
                  <p className="text-white/70">{label(day.date)} · {day.orders} order{day.orders === 1 ? "" : "s"}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-[#616161]">
        <span>{label(days[0]!.date)}</span>
        <span>{label(days[days.length - 1]!.date)}</span>
      </div>
      <table className="sr-only">
        <caption>Daily sales for the last 14 days</caption>
        <thead><tr><th>Date</th><th>Orders</th><th>Sales</th></tr></thead>
        <tbody>{days.map((day) => <tr key={day.date}><td>{label(day.date)}</td><td>{day.orders}</td><td>{money(day.revenue)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
