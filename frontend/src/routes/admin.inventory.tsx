import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Btn, Card, Field, adminInput, when } from "@/components/admin/ui";
import { LoadingRows } from "@/components/ui/loading-rows";
import { api, ApiError } from "@/lib/api";
import { useFeatures } from "@/lib/features";
import { BarcodeLabels } from "@/components/admin/BarcodeLabels";
import { ShopSale } from "@/components/admin/ShopSale";

export const Route = createFileRoute("/admin/inventory")({
  head: () => ({ meta: [{ title: `Inventory — ${brand.name} Admin` }] }),
  component: InventoryTabs,
});

type Tab = "stock" | "sell" | "labels";
const TABS: { id: Tab; label: string }[] = [{ id: "stock", label: "Stock" }, { id: "sell", label: "Quick sell (shop)" }, { id: "labels", label: "Barcode labels" }];

/** Gives every piece and variation without a SKU one, made from its name (GPJ-0123). Existing SKUs are never changed. */
function SkuTool() {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: () => api<{ products: number; variants: number }>("/admin/inventory/generate-skus", { method: "POST" }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(r.products || r.variants ? `Made ${r.products} product SKU${r.products === 1 ? "" : "s"} and ${r.variants} variation SKU${r.variants === 1 ? "" : "s"}.` : "Every piece already has a SKU.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not make the SKUs."),
  });
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#e3e3e3] bg-white px-4 py-3 text-[13px]">
      <p className="min-w-0 flex-1 text-[#616161]">Barcodes use the SKU. Pieces without a SKU get one made from their category code and a number, for example <b>ER-0001</b>, and variations add a short number (<b>ER-0001-1</b>). Set the codes in Categories. SKUs you already have are never changed.</p>
      <Btn disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? "Working…" : "Generate missing SKUs"}</Btn>
    </div>
  );
}

/** Stock for the website and the shop in one place: the stock list, shop sales by scanning, and barcode labels. */
function InventoryTabs() {
  const { offlineShop } = useFeatures();
  const [chosen, setTab] = useState<Tab>("stock");
  // The offline shop is a paid add-on: without it there is only the stock list.
  const tab: Tab = offlineShop ? chosen : "stock";
  const tabs = offlineShop ? TABS : [];
  return (
    <AdminShell title="Inventory">
      {tabs.length ? <div role="tablist" aria-label="Inventory sections" className="mb-4 flex max-w-full overflow-x-auto rounded-lg border border-[#c9c9c9] bg-white sm:inline-flex">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-[13px] font-medium ${tab === t.id ? "bg-[#303030] text-white" : "text-[#303030] hover:bg-[#f7f7f7]"}`}>{t.label}</button>
        ))}
      </div> : null}
      {tab === "stock" ? <><SkuTool /><InventoryPage /></> : tab === "sell" ? <ShopSale /> : <BarcodeLabels />}
    </AdminShell>
  );
}

type State = "ok" | "low" | "out" | "untracked";
type Row = { productId: string; variantId: string | null; name: string; variant: string | null; sku: string | null; price: number; stock: number | null; state: State; image: string | null; published: boolean };
type Data = { rows: Row[]; lowThreshold: number; reasons: string[] };
type Hist = { change: number; after: number | null; reason: string; note: string | null; by: string | null; at: string };

const REASON: Record<string, string> = {
  received: "New stock received", correction: "Correction", damaged: "Damaged or lost", count: "Stock count", other: "Other",
  order: "Sold online", shop: "Sold in the shop", cancel: "Order cancelled", return: "Customer return",
};
const FILTERS = [{ id: "all", label: "All" }, { id: "low", label: "Low and sold out" }, { id: "out", label: "Sold out" }, { id: "untracked", label: "Not tracked" }];
const TONE = { ok: "success", low: "attention", out: "critical", untracked: "neutral" } as const;
const key = (r: Row) => `${r.productId}:${r.variantId ?? ""}`;

function InventoryPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"add" | "set">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("received");
  const [note, setNote] = useState("");

  const list = useQuery({ queryKey: ["admin", "inventory", filter, term], queryFn: () => api<Data>(`/admin/inventory?filter=${filter}&q=${encodeURIComponent(term.trim())}`), placeholderData: (p) => p });
  const current = list.data?.rows.find((r) => key(r) === open) ?? null;
  const history = useQuery({
    queryKey: ["admin", "inventory-history", open],
    enabled: Boolean(current),
    queryFn: () => api<{ items: Hist[] }>(`/admin/inventory/history?product_id=${current!.productId}${current!.variantId ? `&variant_id=${current!.variantId}` : ""}`),
  });

  const adjust = useMutation({
    mutationFn: () => api("/admin/inventory/adjust", { method: "POST", body: { product_id: current!.productId, variant_id: current!.variantId, mode, quantity: Number(qty), reason, note: note.trim() || undefined } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      setQty("");
      setNote("");
      toast.success("Stock updated");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the stock."),
  });

  const valid = qty !== "" && qty !== "-" && Number.isInteger(Number(qty));
  return (
    <>
      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e3e3] px-3 pb-3">
          <div role="tablist" aria-label="Stock filter" className="flex max-w-full overflow-x-auto rounded-lg border border-[#c9c9c9] bg-white">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-[13px] font-medium ${filter === f.id ? "bg-[#303030] text-white" : "hover:bg-[#f7f7f7]"}`}>{f.label}</button>
            ))}
          </div>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name or SKU" className={`${adminInput} max-w-xs`} />
        </div>

        {list.isPending ? (
          <LoadingRows rows={6} />
        ) : list.isError ? (
          <p className="p-6 text-[13px]">Could not load the stock. <Btn onClick={() => void list.refetch()}>Try again</Btn></p>
        ) : list.data.rows.length === 0 ? (
          <p className="px-6 py-14 text-center text-[13px] text-[#616161]">Nothing matches.</p>
        ) : (
          <ul className="divide-y divide-[#ebebeb]">
            {list.data.rows.map((r) => {
              const id = key(r);
              const isOpen = open === id;
              return (
                <li key={id}>
                  <button type="button" onClick={() => { setOpen(isOpen ? null : id); setQty(""); setNote(""); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#fafafa]">
                    <span className="size-10 shrink-0 overflow-hidden rounded-md bg-[#ebebeb]">{r.image ? <img src={r.image} alt="" className="size-full object-cover" /> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{r.name}{r.variant ? <span className="font-normal text-[#616161]"> · {r.variant}</span> : null}</span>
                      <span className="block text-xs text-[#616161]">{r.sku ? `SKU ${r.sku}` : "No SKU"}{r.published ? "" : " · hidden from the shop"}</span>
                    </span>
                    <Badge tone={TONE[r.state]}>{r.state === "untracked" ? "Not tracked" : r.state === "out" ? "Sold out" : r.state === "low" ? "Low" : "In stock"}</Badge>
                    <span className="w-14 text-right text-[13px] font-semibold tabular-nums">{r.stock ?? "—"}</span>
                  </button>

                  {isOpen ? (
                    <div className="grid gap-5 border-t border-[#ebebeb] bg-[#fafafa] p-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <p className="text-[13px] font-semibold">Change the stock</p>
                        <div className="flex gap-2">
                          <Btn variant={mode === "add" ? "primary" : "secondary"} onClick={() => setMode("add")} disabled={r.stock === null}>Add or remove</Btn>
                          <Btn variant={mode === "set" ? "primary" : "secondary"} onClick={() => setMode("set")}>Set to</Btn>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label={mode === "add" ? "Quantity (use − to remove)" : "New stock"}><input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, ""))} className={adminInput} /></Field>
                          <Field label="Reason">
                            <select value={reason} onChange={(e) => setReason(e.target.value)} className={adminInput}>{list.data.reasons.map((x) => <option key={x} value={x}>{REASON[x] ?? x}</option>)}</select>
                          </Field>
                        </div>
                        <Field label="Note (optional)"><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={adminInput} /></Field>
                        {r.stock === null ? <p className="text-xs text-[#616161]">This piece does not track stock (it is always available). "Set to" starts tracking it.</p> : null}
                        <Btn variant="primary" disabled={!valid || adjust.isPending} onClick={() => adjust.mutate()}>{adjust.isPending ? "Saving…" : "Save stock"}</Btn>
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold">History</p>
                        {history.isPending ? <LoadingRows rows={3} /> : history.data && history.data.items.length ? (
                          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1 text-[13px]">
                            {history.data.items.map((h, i) => (
                              <li key={i} className="flex items-start justify-between gap-3 border-b border-[#ebebeb] pb-2 last:border-0">
                                <span className="min-w-0">
                                  <span className="block">{REASON[h.reason] ?? h.reason}{h.note ? ` — ${h.note}` : ""}</span>
                                  <span className="block text-xs text-[#616161]">{when(h.at)}{h.by ? ` · ${h.by}` : ""}</span>
                                </span>
                                <span className="shrink-0 text-right tabular-nums"><span className={h.change < 0 ? "text-[#8e1f0b]" : "text-[#0c5132]"}>{h.change > 0 ? `+${h.change}` : h.change}</span>{h.after !== null ? <span className="block text-xs text-[#616161]">now {h.after}</span> : null}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-2 text-[13px] text-[#616161]">No changes recorded yet. Sales, cancellations, returns and adjustments will appear here.</p>}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-[#616161]">Low stock means {list.data?.lowThreshold ?? 3} or fewer. The limit and the alerts are set in Notifications.</p>
    </>
  );
}
