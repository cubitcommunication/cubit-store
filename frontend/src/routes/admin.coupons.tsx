import { CURRENCY, LOCALE } from "@/config/brand";
import { MATERIALS, brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Copy, Dices, Eye, EyeOff, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, SelectTd, SelectTh, SortTh, useDropMissing, useSelection, useSort } from "@/components/admin/table";
import { Badge, Btn, Card, Field, IconBtn, adminInput, money } from "@/components/admin/ui";
import { tagsQuery } from "@/components/admin/TagInput";
import { db } from "@/lib/data";
import { useAdminCategoryNames } from "@/lib/use-categories";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/coupons")({
  head: () => ({ meta: [{ title: `Discounts — ${brand.name} Admin` }] }),
  // Opened from Products → Tags with ?tag=sale to start a discount for that tag.
  validateSearch: (search: Record<string, unknown>): { tag?: string } => (typeof search["tag"] === "string" && search["tag"] ? { tag: search["tag"].slice(0, 30) } : {}),
  component: CouponsPage,
});

type Coupon = {
  id: string;
  code: string;
  title: string | null;
  description: string | null;
  discount_type: "percentage" | "fixed" | "free_shipping";
  value: number;
  applies_to: "all" | "products" | "categories" | "materials" | "tags";
  applies_ids: string[] | null;
  min_subtotal: number | null;
  min_quantity: number | null;
  max_discount: number | null;
  usage_limit: number | null;
  one_per_customer: boolean;
  first_order_only: boolean;
  exclude_sale_items: boolean;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  show_on_site: boolean;
  times_used: number;
};

const FIELDS =
  "id,code,title,description,discount_type,value,applies_to,applies_ids,min_subtotal,min_quantity,max_discount,usage_limit,one_per_customer,first_order_only,exclude_sale_items,starts_at,ends_at,active,show_on_site,times_used";

type Draft = {
  id?: string;
  code: string;
  title: string;
  description: string;
  discount_type: Coupon["discount_type"];
  value: string;
  applies_to: Coupon["applies_to"];
  applies_ids: string[];
  min_kind: "none" | "amount" | "quantity";
  min_value: string;
  max_discount: string;
  limit_total: boolean;
  usage_limit: string;
  one_per_customer: boolean;
  first_order_only: boolean;
  exclude_sale_items: boolean;
  starts_at: string;
  ends_at: string;
  active: boolean;
  show_on_site: boolean;
};

const blank: Draft = {
  code: "", title: "", description: "", discount_type: "percentage", value: "10", applies_to: "all", applies_ids: [], min_kind: "none", min_value: "",
  max_discount: "", limit_total: false, usage_limit: "", one_per_customer: false, first_order_only: false, exclude_sale_items: false,
  starts_at: "", ends_at: "", active: true, show_on_site: false,
};

/** ISO (UTC) → the value a <input type="datetime-local"> wants, in the admin's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toIso = (local: string): string | null => (local ? new Date(local).toISOString() : null);

function statusOf(c: Coupon): { label: string; tone: "success" | "attention" | "critical" | "neutral" | "info" } {
  const now = Date.now();
  if (!c.active) return { label: "Disabled", tone: "neutral" };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "Scheduled", tone: "info" };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: "Expired", tone: "critical" };
  if (c.usage_limit !== null && c.times_used >= c.usage_limit) return { label: "Used up", tone: "attention" };
  return { label: "Active", tone: "success" };
}

function summary(c: Coupon): string {
  const what = c.discount_type === "percentage" ? `${c.value}% off` : c.discount_type === "fixed" ? `${money(c.value)} off` : "Free shipping";
  const where = c.applies_to === "all" ? "all products" : `${c.applies_ids?.length ?? 0} selected ${c.applies_to === "products" ? "products" : c.applies_to}`;
  const min = c.min_subtotal ? ` · min ${money(c.min_subtotal)}` : c.min_quantity ? ` · min ${c.min_quantity} items` : "";
  return `${what} on ${where}${min}`;
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "PRH" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function toDraft(c: Coupon): Draft {
  return {
    id: c.id, code: c.code, title: c.title ?? "", description: c.description ?? "", discount_type: c.discount_type, value: String(c.value),
    applies_to: c.applies_to, applies_ids: c.applies_ids ?? [], min_kind: c.min_subtotal ? "amount" : c.min_quantity ? "quantity" : "none",
    min_value: String(c.min_subtotal ?? c.min_quantity ?? ""), max_discount: c.max_discount ? String(c.max_discount) : "",
    limit_total: c.usage_limit !== null, usage_limit: c.usage_limit !== null ? String(c.usage_limit) : "", one_per_customer: c.one_per_customer,
    first_order_only: c.first_order_only, exclude_sale_items: c.exclude_sale_items, starts_at: toLocalInput(c.starts_at), ends_at: toLocalInput(c.ends_at),
    active: c.active, show_on_site: c.show_on_site,
  };
}

function CouponsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: async () => {
      const { data, error } = await db.from("coupons").select(FIELDS).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Coupon[];
    },
  });
  const redemptions = useQuery({
    queryKey: ["admin", "coupon-redemptions"],
    queryFn: async () => {
      const { data, error } = await db.from("coupon_redemptions").select("coupon_id,amount").limit(10000);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as { coupon_id: string; amount: number }[];
    },
  });
  const products = useQuery({
    queryKey: ["admin", "coupon-products"],
    queryFn: async () => {
      const { data, error } = await db.from("products").select("id,name").eq("published", true).order("name", { ascending: true }).limit(2000);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as { id: string; name: string }[];
    },
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const { tag: startTag } = Route.useSearch();
  const tagList = useQuery(tagsQuery());
  const { names: categoryNames } = useAdminCategoryNames();
  // "Create a discount" on the Tags page lands here with the tag already chosen.
  useEffect(() => {
    if (startTag) setDraft({ ...blank, code: randomCode(), title: `${startTag} sale`, applies_to: "tags", applies_ids: [startTag] });
  }, [startTag]);
  const [error, setError] = useState<string | null>(null);
  const [find, setFind] = useState("");

  const saved = useMemo(() => {
    const m = new Map<string, number>();
    (redemptions.data ?? []).forEach((r) => m.set(r.coupon_id, (m.get(r.coupon_id) ?? 0) + Number(r.amount)));
    return m;
  }, [redemptions.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    void qc.invalidateQueries({ queryKey: ["admin", "coupon-redemptions"] });
    void qc.invalidateQueries({ queryKey: ["promotions"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const code = d.code.replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error("The code must be 3–40 letters, numbers, - or _ (no spaces).");
      const value = Number(d.value) || 0;
      if (d.discount_type === "percentage" && (value <= 0 || value > 100)) throw new Error("A percentage must be between 1 and 100.");
      if (d.discount_type === "fixed" && value <= 0) throw new Error("Enter the amount to take off.");
      if (d.applies_to !== "all" && d.applies_ids.length === 0) throw new Error(`Choose at least one ${d.applies_to === "products" ? "product" : d.applies_to === "categories" ? "category" : d.applies_to === "tags" ? "tag" : "material"}.`);
      if (d.min_kind !== "none" && !(Number(d.min_value) > 0)) throw new Error("Enter the minimum requirement, or choose “No minimum”.");
      if (d.limit_total && !(Number(d.usage_limit) >= 1)) throw new Error("Enter how many times the code can be used.");
      const starts = toIso(d.starts_at);
      const ends = toIso(d.ends_at);
      if (starts && ends && new Date(ends) <= new Date(starts)) throw new Error("The end date must be after the start date.");

      const row = {
        code, title: d.title.trim() || null, description: d.description.trim() || null, discount_type: d.discount_type,
        value: d.discount_type === "free_shipping" ? 0 : value, applies_to: d.applies_to, applies_ids: d.applies_to === "all" ? null : d.applies_ids,
        min_subtotal: d.min_kind === "amount" ? Number(d.min_value) : null, min_quantity: d.min_kind === "quantity" ? Math.round(Number(d.min_value)) : null,
        max_discount: d.discount_type === "percentage" && Number(d.max_discount) > 0 ? Number(d.max_discount) : null,
        usage_limit: d.limit_total ? Math.round(Number(d.usage_limit)) : null, one_per_customer: d.one_per_customer,
        first_order_only: d.first_order_only, exclude_sale_items: d.exclude_sale_items, starts_at: starts, ends_at: ends,
        active: d.active, show_on_site: d.show_on_site,
      };
      const { error: e } = d.id ? await db.from("coupons").update(row).eq("id", d.id) : await db.from("coupons").insert(row);
      if (e) throw new Error(/duplicate/i.test(e.message) ? "That code already exists. Choose another." : e.message);
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      refresh();
      toast.success("Discount saved");
    },
    onError: (e: Error) => setError(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Coupon> }) => {
      const { error: e } = await db.from("coupons").update(values).eq("id", id);
      if (e) throw new Error(e.message);
    },
    onSuccess: refresh,
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const remove = useMutation({
    mutationFn: async (c: Coupon) => {
      const { error: e } = await db.from("coupons").delete().eq("id", c.id);
      if (e) throw new Error(e.message);
    },
    onSuccess: () => { refresh(); toast.success("Discount deleted"); },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const base = list.data ?? [];
  const sel = useSelection();
  const { rows, sort, toggle } = useSort<Coupon>(base, {
    code: (c) => c.code,
    status: (c) => statusOf(c).label,
    discount: (c) => (c.discount_type === "free_shipping" ? 0 : Number(c.value)),
    used: (c) => c.times_used,
    saved: (c) => saved.get(c.id) ?? 0,
  });
  useDropMissing(sel, base.map((c) => c.id));
  const bulk = useMutation({
    mutationFn: async (a: { ids: string[]; action: "enable" | "disable" | "delete" }) => {
      const table = db.from("coupons");
      const { error: e } = a.action === "delete" ? await table.delete().in("id", a.ids) : await table.update({ active: a.action === "enable" }).in("id", a.ids);
      if (e) throw new Error(e.message);
      return a;
    },
    onSuccess: (a) => {
      refresh();
      sel.clear();
      toast.success(a.action === "delete" ? "Discounts deleted" : a.action === "enable" ? "Discounts enabled" : "Discounts disabled");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });
  const selectedIds = [...sel.selected];
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const productList = (products.data ?? []).filter((p) => !find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 80);
  const toggleId = (id: string) => draft && set("applies_ids", draft.applies_ids.includes(id) ? draft.applies_ids.filter((x) => x !== id) : [...draft.applies_ids, id]);
  const nameOfProduct = (id: string) => (products.data ?? []).find((p) => p.id === id)?.name ?? "Product";

  const optionRow = "flex items-center gap-2 text-[13px]";

  return (
    <AdminShell title="Discounts" actions={<Btn variant="primary" onClick={() => { setError(null); setDraft({ ...blank, code: randomCode() }); }}><Plus className="size-3.5" /> Create discount</Btn>}>
      <p className="mb-3 max-w-2xl text-[13px] text-[#616161]">
        Discount codes customers enter in the cart or at checkout. Turn on “Show on website” to promote a code next to Add to cart, in the cart and at checkout. Every amount is worked out on the server.
      </p>

      {draft ? (
        <Card title={draft.id ? `Edit ${draft.code}` : "Create discount"} className="mb-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="grid content-start gap-3">
              <Field label="Discount code" help="Customers type this. Letters and numbers only.">
                <div className="flex gap-2">
                  <input className={`${adminInput} font-mono uppercase tracking-wider`} value={draft.code} maxLength={40} onChange={(e) => set("code", e.target.value.toUpperCase())} />
                  <Btn onClick={() => set("code", randomCode())} title="Generate a code"><Dices className="size-3.5" /> Generate</Btn>
                </div>
              </Field>
              <Field label="Title (only you see this)" help="For example “Diwali offer”.">
                <input className={adminInput} value={draft.title} maxLength={160} onChange={(e) => set("title", e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className={adminInput} value={draft.discount_type} onChange={(e) => set("discount_type", e.target.value as Draft["discount_type"])}>
                    <option value="percentage">Percentage off</option>
                    <option value="fixed">Fixed amount off</option>
                    <option value="free_shipping">Free shipping</option>
                  </select>
                </Field>
                {draft.discount_type !== "free_shipping" ? (
                  <Field label={draft.discount_type === "percentage" ? "Percentage (%)" : `Amount (${CURRENCY})`}>
                    <input type="number" min={0} className={adminInput} value={draft.value} onChange={(e) => set("value", e.target.value)} />
                  </Field>
                ) : <div />}
              </div>
              {draft.discount_type === "percentage" ? (
                <Field label={`Maximum discount (${CURRENCY}, optional)`} help="Caps how much one order can save.">
                  <input type="number" min={0} className={adminInput} value={draft.max_discount} onChange={(e) => set("max_discount", e.target.value)} />
                </Field>
              ) : null}

              <Field label="Applies to">
                <select className={adminInput} value={draft.applies_to} onChange={(e) => setDraft({ ...draft, applies_to: e.target.value as Draft["applies_to"], applies_ids: [] })}>
                  <option value="all">All products</option>
                  <option value="categories">Specific categories</option>
                  <option value="materials">Specific materials</option>
                  <option value="products">Specific products</option>
                  <option value="tags">Products with a tag</option>
                </select>
              </Field>
              {draft.applies_to === "tags" ? (
                <div className="grid gap-1.5 rounded-lg border border-[#e3e3e3] p-3">
                  {(() => {
                    // Tags already in use, plus any chosen tag that no product carries yet.
                    const names = [...(tagList.data?.tags ?? []).map((t) => t.tag), ...draft.applies_ids.filter((id) => !(tagList.data?.tags ?? []).some((t) => t.tag.toLowerCase() === id.toLowerCase()))];
                    if (!names.length) return <p className="text-xs text-[#616161]">No tags yet. Add tags to products (or in Products → Tags), then choose them here.</p>;
                    return names.map((name) => {
                      const count = (tagList.data?.tags ?? []).find((t) => t.tag.toLowerCase() === name.toLowerCase())?.count ?? 0;
                      const on = draft.applies_ids.some((id) => id.toLowerCase() === name.toLowerCase());
                      return (
                        <label key={name} className={optionRow}>
                          <input type="checkbox" checked={on} onChange={() => set("applies_ids", on ? draft.applies_ids.filter((id) => id.toLowerCase() !== name.toLowerCase()) : [...draft.applies_ids, name])} /> {name} <span className="text-xs text-[#616161]">({count} {count === 1 ? "product" : "products"})</span>
                        </label>
                      );
                    });
                  })()}
                  <p className="mt-1 text-xs text-[#616161]">The discount applies to any product that has at least one of the chosen tags.</p>
                </div>
              ) : null}
              {draft.applies_to === "categories" ? (
                <div className="grid gap-1.5 rounded-lg border border-[#e3e3e3] p-3">
                  {categoryNames.map((c) => (
                    <label key={c} className={optionRow}><input type="checkbox" checked={draft.applies_ids.includes(c)} onChange={() => toggleId(c)} /> {c}</label>
                  ))}
                </div>
              ) : null}
              {draft.applies_to === "materials" ? (
                <div className="grid gap-1.5 rounded-lg border border-[#e3e3e3] p-3">
                  {MATERIALS.map((m) => (
                    <label key={m} className={optionRow}><input type="checkbox" checked={draft.applies_ids.includes(m)} onChange={() => toggleId(m)} /> {m}</label>
                  ))}
                </div>
              ) : null}
              {draft.applies_to === "products" ? (
                <div className="rounded-lg border border-[#e3e3e3] p-3">
                  {draft.applies_ids.length ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {draft.applies_ids.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#f1f1f1] py-0.5 pl-2.5 pr-1 text-xs">
                          {nameOfProduct(id)}
                          <button type="button" aria-label="Remove" onClick={() => toggleId(id)} className="flex size-4 items-center justify-center rounded-full hover:bg-[#e3e3e3]"><X className="size-3" /></button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <input className={adminInput} placeholder="Search products" value={find} onChange={(e) => setFind(e.target.value)} />
                  <ul className="mt-2 max-h-44 overflow-y-auto">
                    {productList.map((p) => (
                      <li key={p.id}><label className={`${optionRow} py-1`}><input type="checkbox" checked={draft.applies_ids.includes(p.id)} onChange={() => toggleId(p.id)} /> {p.name}</label></li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <label className={optionRow}><input type="checkbox" checked={draft.exclude_sale_items} onChange={(e) => set("exclude_sale_items", e.target.checked)} /> Don’t apply to items already on sale (with a “was” price)</label>
            </div>

            <div className="grid content-start gap-3">
              <Field label="Minimum requirement">
                <div className="grid grid-cols-2 gap-2">
                  <select className={adminInput} value={draft.min_kind} onChange={(e) => set("min_kind", e.target.value as Draft["min_kind"])}>
                    <option value="none">No minimum</option>
                    <option value="amount">Minimum purchase ({CURRENCY})</option>
                    <option value="quantity">Minimum items</option>
                  </select>
                  {draft.min_kind !== "none" ? <input type="number" min={1} className={adminInput} value={draft.min_value} onChange={(e) => set("min_value", e.target.value)} /> : null}
                </div>
              </Field>

              <div className="grid gap-2 rounded-lg border border-[#e3e3e3] p-3">
                <p className="text-[13px] font-medium">Usage limits</p>
                <label className={optionRow}><input type="checkbox" checked={draft.limit_total} onChange={(e) => set("limit_total", e.target.checked)} /> Limit the total number of times this code can be used</label>
                {draft.limit_total ? <input type="number" min={1} className={adminInput} value={draft.usage_limit} onChange={(e) => set("usage_limit", e.target.value)} /> : null}
                <label className={optionRow}><input type="checkbox" checked={draft.one_per_customer} onChange={(e) => set("one_per_customer", e.target.checked)} /> One use per customer</label>
                <label className={optionRow}><input type="checkbox" checked={draft.first_order_only} onChange={(e) => set("first_order_only", e.target.checked)} /> New customers only (first order)</label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Starts (optional)"><input type="datetime-local" className={adminInput} value={draft.starts_at} onChange={(e) => set("starts_at", e.target.value)} /></Field>
                <Field label="Ends (optional)"><input type="datetime-local" className={adminInput} value={draft.ends_at} onChange={(e) => set("ends_at", e.target.value)} /></Field>
              </div>

              <div className="grid gap-2 rounded-lg border border-[#e3e3e3] p-3">
                <label className={optionRow}><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} /> <span><b>Active</b> — customers can use this code</span></label>
                <label className={optionRow}><input type="checkbox" checked={draft.show_on_site} onChange={(e) => set("show_on_site", e.target.checked)} /> <span><b>Show on website</b> — promote it near Add to cart, in the cart and at checkout</span></label>
                {draft.show_on_site ? (
                  <Field label="Text shown to customers" help="For example “Summer offer: 10% off everything”.">
                    <input className={adminInput} value={draft.description} maxLength={300} onChange={(e) => set("description", e.target.value)} />
                  </Field>
                ) : null}
              </div>

              {error ? <p role="alert" className="text-[13px] text-[#8e1f0b]">{error}</p> : null}
              <div className="flex gap-2">
                <Btn variant="primary" disabled={save.isPending} onClick={() => save.mutate(draft)}>{save.isPending ? "Saving…" : "Save discount"}</Btn>
                <Btn onClick={() => { setDraft(null); setError(null); }}>Cancel</Btn>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card flush>
        <BulkBar sel={sel}>
          <Btn disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: selectedIds, action: "enable" })}>Enable</Btn>
          <Btn disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: selectedIds, action: "disable" })}>Disable</Btn>
          <Btn disabled={bulk.isPending} className="!text-[#8e1f0b]" onClick={() => { if (window.confirm(`Delete ${selectedIds.length} discount${selectedIds.length === 1 ? "" : "s"}? Orders that used them keep their discount.`)) bulk.mutate({ ids: selectedIds, action: "delete" }); }}><Trash2 className="size-3.5" />Delete</Btn>
        </BulkBar>
        {list.isPending ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">No discounts yet</p>
            <p className="mt-1 text-[13px] text-[#616161]">Create a code such as DIWALI10 and customers can use it at checkout.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr>
                  <SelectTh ids={rows.map((r) => r.id)} sel={sel} />
                  <SortTh label="Code" k="code" sort={sort} onToggle={toggle} />
                  <SortTh label="Status" k="status" sort={sort} onToggle={toggle} />
                  <SortTh label="Discount" k="discount" sort={sort} onToggle={toggle} />
                  <SortTh label="Used" k="used" sort={sort} onToggle={toggle} className="w-28" />
                  <SortTh label="Given away" k="saved" sort={sort} onToggle={toggle} className="w-32" />
                  <th className="w-40"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const st = statusOf(c);
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <SelectTd id={c.id} label={c.code} sel={sel} />
                      <td>
                        <p className="font-mono text-[13px] font-semibold tracking-wider">{c.code}</p>
                        {c.title ? <p className="text-xs text-[#616161]">{c.title}</p> : null}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {c.show_on_site ? <Badge tone="info">On website</Badge> : null}
                        </div>
                        {c.ends_at ? <p className="mt-1 text-xs text-[#616161]">Ends {new Date(c.ends_at).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}</p> : null}
                      </td>
                      <td className="text-[#303030]">{summary(c)}</td>
                      <td>{c.times_used}{c.usage_limit !== null ? ` / ${c.usage_limit}` : ""}</td>
                      <td>{money(saved.get(c.id) ?? 0)}</td>
                      <td>
                        <div className="flex justify-end gap-0.5">
                          <IconBtn icon={Copy} label="Copy code" onClick={() => { void navigator.clipboard?.writeText(c.code); toast.success("Code copied"); }} />
                          <IconBtn icon={c.show_on_site ? EyeOff : Eye} label={c.show_on_site ? "Stop showing on website" : "Show on website"} onClick={() => patch.mutate({ id: c.id, values: { show_on_site: !c.show_on_site } })} />
                          <IconBtn icon={Power} label={c.active ? "Disable" : "Enable"} onClick={() => patch.mutate({ id: c.id, values: { active: !c.active } })} />
                          <IconBtn icon={Pencil} label="Edit" onClick={() => { setError(null); setDraft(toDraft(c)); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                          <IconBtn icon={Trash2} label="Delete" tone="danger" onClick={() => { if (window.confirm(`Delete ${c.code}? Orders that used it keep their discount.`)) remove.mutate(c); }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
