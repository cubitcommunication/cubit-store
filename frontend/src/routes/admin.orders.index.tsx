import { brand } from "@/config/brand";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, SelectTd, SelectTh, SortTh, useSelection, type SortState } from "@/components/admin/table";
import { api } from "@/lib/api";
import { downloadTextFile } from "@/lib/csv";
import { Btn, Card, adminInput, fulfilmentBadge, money, paymentBadge, when } from "@/components/admin/ui";
import { db } from "@/lib/data";
import { useFeatures } from "@/lib/features";

type Tab = "all" | "unfulfilled" | "unpaid" | "cancelled" | "online" | "shop";
const SORTABLE = ["number", "created_at", "name", "payment_status", "fulfillment_status", "total"] as const;
type Search = { q?: string | undefined; tab?: Tab | undefined; page?: number | undefined; sort?: (typeof SORTABLE)[number] | undefined; dir?: "asc" | "desc" | undefined };

export const Route = createFileRoute("/admin/orders/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s["q"] === "string" && s["q"] ? (s["q"] as string).slice(0, 80) : undefined,
    tab: ["unfulfilled", "unpaid", "cancelled", "online", "shop"].includes(String(s["tab"])) ? (s["tab"] as Tab) : undefined,
    page: Number(s["page"]) > 1 ? Math.trunc(Number(s["page"])) : undefined,
    sort: (SORTABLE as readonly string[]).includes(String(s["sort"])) ? (s["sort"] as (typeof SORTABLE)[number]) : undefined,
    dir: s["dir"] === "asc" || s["dir"] === "desc" ? s["dir"] : undefined,
  }),
  head: () => ({ meta: [{ title: `Orders — ${brand.name} Admin` }] }),
  component: OrdersPage,
});

const PAGE = 25;
const FIELDS = "id,number,name,email,phone,status,payment_status,payment_method,channel,fulfillment_status,total,created_at";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unfulfilled", label: "Unfulfilled" },
  { key: "unpaid", label: "Payment pending" },
  { key: "cancelled", label: "Cancelled" },
  { key: "online", label: "Online" },
  { key: "shop", label: "Shop" },
];
const METHOD: Record<string, string> = { cod: "COD", razorpay: "Online", cash: "Cash", upi: "UPI", card: "Card" };

type Row = { id: string; number: number; name: string; email: string; phone: string; status: string; payment_status: string; payment_method: string; channel: string; fulfillment_status: string; total: number; created_at: string };

function OrdersPage() {
  const { q, tab = "all", page = 1, sort: sortCol, dir } = Route.useSearch();
  const qc = useQueryClient();
  const { offlineShop } = useFeatures();
  const sel = useSelection();
  const navigate = useNavigate({ from: "/admin/orders/" });
  const [term, setTerm] = useState(q ?? "");
  useEffect(() => setTerm(q ?? ""), [q]);

  const orders = useQuery({
    queryKey: ["admin", "orders", { q, tab, page, sortCol, dir }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = db.from("orders").select(FIELDS, { count: "exact" }).order(sortCol ?? "created_at", { ascending: sortCol ? dir === "asc" : false }).range((page - 1) * PAGE, page * PAGE - 1);
      if (tab === "unfulfilled") query = query.eq("status", "open").eq("fulfillment_status", "unfulfilled");
      if (tab === "unpaid") query = query.eq("status", "open").eq("payment_status", "pending");
      if (tab === "cancelled") query = query.eq("status", "cancelled");
      if (tab === "online" || tab === "shop") query = query.eq("channel", tab);
      if (q) {
        const safe = q.replace(/[,%()]/g, " ").trim();
        const parts = [`name.ilike.%${safe}%`, `email.ilike.%${safe}%`, `phone.ilike.%${safe}%`];
        if (/^\d+$/.test(safe)) parts.push(`number.eq.${safe}`);
        query = query.or(parts.join(","));
      }
      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as unknown as Row[], count: count ?? 0 };
    },
  });

  const rows = orders.data?.rows ?? [];
  // A selection belongs to the page you are looking at: clear it when the view changes.
  useEffect(() => sel.clear(), [q, tab, page, sortCol, dir]);
  const sort: SortState = sortCol ? { key: sortCol, dir: dir === "asc" ? "asc" : "desc" } : null;
  // Click cycles: ascending -> descending -> back to newest first.
  const toggle = (key: string) =>
    void navigate({
      search: (prev: Search) => ({ ...prev, page: undefined, ...(sortCol !== key ? { sort: key as Search["sort"], dir: "asc" as const } : dir === "asc" ? { sort: key as Search["sort"], dir: "desc" as const } : { sort: undefined, dir: undefined }) }),
    } as never);

  const [busy, setBusy] = useState(false);
  async function bulkAction(action: "fulfil" | "mark_paid", label: string) {
    const ids = [...sel.selected];
    setBusy(true);
    const results = await Promise.allSettled(ids.map((id) => api(`/admin/orders/${id}`, { method: "POST", body: { action } })));
    setBusy(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    void qc.invalidateQueries({ queryKey: ["admin"] });
    sel.clear();
    if (failed) toast.error(`${ids.length - failed} order${ids.length - failed === 1 ? "" : "s"} ${label}; ${failed} could not be changed (for example cancelled orders).`);
    else toast.success(`${ids.length} order${ids.length === 1 ? "" : "s"} ${label}`);
  }
  function exportSelected() {
    const q2 = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = rows.filter((o) => sel.has(o.id)).map((o) => [o.number, q2(o.created_at), q2(o.name), q2(o.email), q2(o.phone), o.payment_status, o.payment_method, o.fulfillment_status, o.status, o.total].join(","));
    downloadTextFile("shop-orders.csv", ["Order,Date,Name,Email,Phone,Payment,Method,Fulfilment,Status,Total", ...lines].join("\r\n"));
  }
  const pages = Math.max(1, Math.ceil((orders.data?.count ?? 0) / PAGE));
  const set = (next: Partial<Search>) => void navigate({ search: (prev: Search) => ({ ...prev, page: undefined, ...next }) } as never);

  return (
    <AdminShell title="Orders">
      <Card flush>
        <BulkBar sel={sel}>
          <Btn disabled={busy} onClick={() => void bulkAction("fulfil", "marked as fulfilled")}>Mark as fulfilled</Btn>
          <Btn disabled={busy} onClick={() => void bulkAction("mark_paid", "marked as paid")}>Mark as paid</Btn>
          <Btn onClick={exportSelected}><Download className="size-3.5" /> Export CSV</Btn>
        </BulkBar>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e3e3] px-3 pb-3">
          {TABS.filter((t) => offlineShop || (t.key !== "online" && t.key !== "shop")).map((t) => (
            <button key={t.key} type="button" onClick={() => set({ tab: t.key === "all" ? undefined : t.key })}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${tab === t.key ? "bg-[#e3e3e3]" : "hover:bg-[#f1f1f1]"}`}>
              {t.label}
            </button>
          ))}
          <form className="ml-auto flex gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: term.trim() || undefined }); }}>
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search order #, name, e-mail, phone" className={`${adminInput} w-64`} />
            <Btn type="submit">Search</Btn>
          </form>
        </div>

        {orders.isError ? (
          <p className="p-6 text-[13px] text-[#8e1f0b]">Could not load orders.</p>
        ) : rows.length === 0 && !orders.isPending ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">No orders {q || tab !== "all" ? "match this view" : "yet"}</p>
            <p className="mt-1 text-[13px] text-[#616161]">{q || tab !== "all" ? "Try a different search or tab." : "When customers place orders they will show up here. Online ordering is switched on in Store features."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e3e3e3] bg-[#f7f7f7] text-xs text-[#616161]">
                  <SelectTh ids={rows.map((r) => r.id)} sel={sel} />
                  {([["Order", "number"], ["Date", "created_at"], ["Customer", "name"], ["Payment", "payment_status"], ["Fulfilment", "fulfillment_status"], ["Total", "total"]] as const).map(([h, k]) => (
                    <SortTh key={k} label={h} k={k} sort={sort} onToggle={toggle} align={k === "total" ? "right" : "left"} className="px-3 py-2" />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b border-[#ebebeb] last:border-0 hover:bg-[#fafafa]">
                    <SelectTd id={o.id} label={`order ${o.number}`} sel={sel} />
                    <td className="px-3 py-3"><Link to="/admin/orders/$id" params={{ id: o.id }} className="font-semibold hover:underline">#{o.number}</Link>{o.channel === "shop" ? <span className="ml-1.5 rounded bg-[#e3e3e3] px-1.5 py-0.5 text-[11px] font-medium">Shop</span> : null}</td>
                    <td className="px-3 py-3 text-[#616161]">{when(o.created_at)}</td>
                    <td className="px-3 py-3">{o.name}{o.email || o.phone ? <span className="block text-xs text-[#616161]">{o.email || o.phone}</span> : null}</td>
                    <td className="px-3 py-3">{paymentBadge(o.payment_status)}<span className="ml-1 text-xs text-[#616161]">{METHOD[o.payment_method] ?? o.payment_method}</span></td>
                    <td className="px-3 py-3">{fulfilmentBadge(o.fulfillment_status, o.status)}</td>
                    <td className="px-3 py-3 text-right font-medium">{money(Number(o.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-[#e3e3e3] px-3 pt-3 text-[13px]">
            <span className="text-[#616161]">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Btn disabled={page <= 1} onClick={() => set({ page: page - 1 })}>Previous</Btn>
              <Btn disabled={page >= pages} onClick={() => navigate({ search: (prev: Search) => ({ ...prev, page: page + 1 }) } as never)}>Next</Btn>
            </div>
          </div>
        ) : null}
      </Card>
    </AdminShell>
  );
}
