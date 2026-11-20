import { CURRENCY, LOCALE } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileSpreadsheet, Pencil, Plus, RotateCcw, Search, Tag, Trash2, Upload, X } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { SortTh, type SortState } from "@/components/admin/table";
import { Badge, Btn, Card, IconBtn, adminInput, iconLinkClass } from "@/components/admin/ui";
import { db } from "@/lib/data";
import { ADMIN_PAGE_SIZE, adminProductsQuery, fetchMatchingProductIds, type AdminFlag, type AdminProduct, type AdminSort } from "@/lib/admin";
import { blankTemplateCsv, downloadTextFile } from "@/lib/csv";
import { exportProductsCsv } from "@/lib/bulk.functions";
import { formatPrice, brand } from "@/config/brand";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/products/")({
  head: () => ({ meta: [{ title: `Products — ${brand.name} Admin` }] }),
  component: ProductsList,
});

const FLAGS: { id: AdminFlag; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "featured", label: "Featured" },
  { id: "new_arrival", label: "New arrival" },
  { id: "sale", label: "On sale" },
  { id: "archived", label: "Archived" },
];

/** Column title -> [ascending, descending] sort orders. The page's default (newest edit first) is "Updated", descending. */
const COLUMN_SORTS: Record<string, [AdminSort, AdminSort]> = {
  name: ["name_asc", "name_desc"],
  status: ["status_asc", "status_desc"],
  category: ["category_asc", "category_desc"],
  material: ["material_asc", "material_desc"],
  price: ["price_asc", "price_desc"],
  updated: ["updated_asc", "updated"],
};
function sortState(sort: AdminSort): SortState {
  for (const [key, [asc, desc]] of Object.entries(COLUMN_SORTS)) {
    if (sort === asc) return { key, dir: "asc" };
    if (sort === desc) return { key, dir: "desc" };
  }
  return null;
}

const SORTS: { id: AdminSort; label: string }[] = [
  { id: "updated", label: "Recently updated" },
  { id: "name_asc", label: "A → Z" },
  { id: "name_desc", label: "Z → A" },
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
];

const PRICE_RANGES: { label: string; min: number | null; max: number | null }[] = []; // the Min / Max boxes below do the filtering

type BulkFlag = "featured" | "new_arrival";
const BULK_FLAGS: { id: BulkFlag; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "new_arrival", label: "New arrival" },
];

const toNum = (v: string) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};

const menuBtn = "rounded-md border border-[#c9c9c9] px-2 py-0.5 text-xs font-semibold hover:bg-[#f1f1f1]";

function ProductsList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [flag, setFlag] = useState<AdminFlag>("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<AdminSort>("updated");
  const [category, setCategory] = useState("");
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [confirm, setConfirm] = useState<AdminProduct | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "sale" | "category" | "delete">(null);
  const [busy, setBusy] = useState(false);

  const minPrice = toNum(minText);
  const maxPrice = toNum(maxText);
  const filters = { search, flag, category: category || undefined, minPrice, maxPrice };

  const { data, isPending, isError, refetch } = useQuery(adminProductsQuery({ page, sort, ...filters }));
  const headSort = sortState(sort);
  const toggleSort = (key: string) => {
    const [asc, desc] = COLUMN_SORTS[key]!;
    // Click cycles ascending -> descending -> back to the default order.
    setSort(headSort?.key !== key ? asc : headSort.dir === "asc" ? desc : "updated");
    setPage(1);
  };
  const { data: categories } = useQuery({
    queryKey: ["admin", "category-names"],
    queryFn: async () => {
      const { data: rows } = await db.from("categories").select("name").order("name", { ascending: true });
      return ((rows ?? []) as { name: string }[]).map((r) => r.name);
    },
  });

  // A selection belongs to one set of filters; clear it when they change.
  const filterKey = JSON.stringify([search, flag, category, minPrice, maxPrice]);
  useEffect(() => setSelected(new Set()), [filterKey]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["product"] });
  };

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: { published?: boolean; archived_at?: string | null } }) => {
      const { error } = await db.from("products").update(input.patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Product updated");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / ADMIN_PAGE_SIZE));
  const rows = data?.rows ?? [];
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const archivedView = flag === "archived";
  const hasExtraFilter = minText !== "" || maxText !== "" || category !== "";

  async function exportAll() {
    setExporting(true);
    try {
      const { csv } = await exportProductsCsv({ data: {} });
      downloadTextFile("shop-products.csv", csv);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function exportOne(product: AdminProduct) {
    try {
      const { csv } = await exportProductsCsv({ data: { id: product.id } });
      downloadTextFile(`${product.sku || product.slug}.csv`, csv);
    } catch {
      toast.error("Download failed. Please try again.");
    }
  }

  function togglePage() {
    setSelected((cur) => {
      const next = new Set(cur);
      if (allOnPage) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function selectAllMatching() {
    try {
      setSelected(new Set(await fetchMatchingProductIds(filters)));
    } catch {
      toast.error("Could not select all products. Please try again.");
    }
  }

  /** Runs a bulk change on the selected products, then refreshes the list. */
  async function runBulk(label: string, work: (ids: string[]) => Promise<string | void>) {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    setMenu(false);
    try {
      const note = await work(ids);
      toast.success(note || `${label}: ${ids.length} product${ids.length === 1 ? "" : "s"}`);
      setSelected(new Set());
      setDialog(null);
    } catch {
      toast.error("Something went wrong. Some products may not have changed.");
    } finally {
      invalidate();
      setBusy(false);
    }
  }

  const patchMany = async (ids: string[], patch: Record<string, unknown>) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db.from("products").update(patch).in("id", ids.slice(i, i + 200));
      if (error) throw error;
    }
  };

  /** Reads price, MRP and variant count for the chosen products, then lets `each` update them one by one. */
  const eachPriced = async (ids: string[], each: (r: { id: string; price: number; mrp: number | null; hasVariants: boolean }) => Promise<boolean>) => {
    let done = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const { data: found, error } = await db.from("products").select("id,price,compare_at_price,product_variants(id)").in("id", ids.slice(i, i + 200));
      if (error) throw error;
      for (const r of (found ?? []) as any[]) {
        const ok = await each({ id: r.id, price: Number(r.price), mrp: r.compare_at_price != null ? Number(r.compare_at_price) : null, hasVariants: (r.product_variants ?? []).length > 0 });
        if (ok) done++;
      }
    }
    return done;
  };
  const savePrices = async (id: string, patch: { price: number; compare_at_price: number | null }) => {
    const { error } = await db.from("products").update(patch).eq("id", id);
    if (error) throw error;
    return true;
  };

  /** Sale: selling price = MRP less x%. The current price becomes the MRP the first time. Products with variants are skipped. */
  const applySale = (percent: number) =>
    runBulk("Sale applied", async (ids) => {
      const total = ids.length;
      const done = await eachPriced(ids, async (r) => {
        const mrp = r.mrp != null && r.mrp > r.price ? r.mrp : r.price;
        if (r.hasVariants || !(mrp > 0)) return false;
        return savePrices(r.id, { compare_at_price: mrp, price: Math.max(1, Math.round(mrp * (1 - percent / 100))) });
      });
      const skipped = total - done;
      return `${percent}% sale applied to ${done} product${done === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped (has variants or no price)` : ""}`;
    });

  /** Ends a sale: the MRP becomes the selling price again. */
  const endSale = () =>
    runBulk("Sale ended", async (ids) => {
      const done = await eachPriced(ids, async (r) => {
        if (r.mrp == null || r.hasVariants) return false;
        return savePrices(r.id, { price: Math.max(r.mrp, r.price), compare_at_price: null });
      });
      return `Sale ended on ${done} product${done === 1 ? "" : "s"} (price back to the MRP)`;
    });

  const statusBadge = (p: AdminProduct) =>
    p.archived_at ? <Badge>Archived</Badge> : p.published ? <Badge tone="success">Active</Badge> : <Badge tone="attention">Draft</Badge>;

  return (
    <AdminShell
      title="Products"
      actions={
        <>
          <IconBtn icon={FileSpreadsheet} label="Download CSV template" onClick={() => downloadTextFile("shop-product-template.csv", blankTemplateCsv())} className="border-[#c9c9c9] bg-white" />
          <Btn onClick={() => void exportAll()} disabled={exporting}><Download className="size-3.5" />{exporting ? "Exporting…" : "Export"}</Btn>
          <Link to="/admin/products/import"><Btn><Upload className="size-3.5" />Import</Btn></Link>
          <Link to="/admin/products/new"><Btn variant="primary"><Plus className="size-3.5" />Add product</Btn></Link>
        </>
      }
    >
      <Card flush>
        <div className="space-y-3 border-b border-[#e3e3e3] px-3 pb-3">
          <div className="flex flex-wrap gap-1">
            {FLAGS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setFlag(f.id); setPage(1); }}
                aria-pressed={flag === f.id}
                className={`rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors ${flag === f.id ? "bg-[#e3e3e3] text-[#303030]" : "text-[#616161] hover:bg-[#f1f1f1]"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] max-w-md flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#8a8a8a]" />
              <label className="sr-only" htmlFor="admin-search">Search products</label>
              <input
                id="admin-search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name, SKU, category, material"
                className={`${adminInput} !pl-8`}
              />
            </div>
            <label className="flex items-center gap-1.5 text-[13px] text-[#616161]">
              Sort
              <select value={sort} onChange={(e) => { setSort(e.target.value as AdminSort); setPage(1); }} className={`${adminInput} !w-auto`}>
                {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[13px] text-[#616161]">
              Category
              <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={`${adminInput} !w-auto`}>
                <option value="">All</option>
                {(categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-[#616161]">Price</span>
            {PRICE_RANGES.map((r) => {
              const active = minPrice === r.min && maxPrice === r.max;
              return (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setMinText(active || r.min == null ? "" : String(r.min));
                    setMaxText(active || r.max == null ? "" : String(r.max));
                    setPage(1);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-[13px] font-medium transition-colors ${active ? "border-[#303030] bg-[#303030] text-white" : "border-[#c9c9c9] text-[#303030] hover:bg-[#f1f1f1]"}`}
                >
                  {r.label}
                </button>
              );
            })}
            <input inputMode="numeric" aria-label="Minimum price" placeholder={`Min ${CURRENCY}`} value={minText} onChange={(e) => { setMinText(e.target.value.replace(/[^\d.]/g, "")); setPage(1); }} className={`${adminInput} !w-24`} />
            <span className="text-[#8a8a8a]">–</span>
            <input inputMode="numeric" aria-label="Maximum price" placeholder={`Max ${CURRENCY}`} value={maxText} onChange={(e) => { setMaxText(e.target.value.replace(/[^\d.]/g, "")); setPage(1); }} className={`${adminInput} !w-24`} />
            {hasExtraFilter ? (
              <Btn variant="plain" onClick={() => { setMinText(""); setMaxText(""); setCategory(""); setPage(1); }}><X className="size-3.5" />Clear</Btn>
            ) : null}
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="sticky top-[110px] z-20 flex flex-wrap items-center gap-2 border-b border-[#e3e3e3] bg-[#f7f7f7] px-3 py-2 text-[13px]">
            <span className="font-semibold">{selected.size} selected</span>
            {data && selected.size < data.total ? <Btn variant="plain" onClick={() => void selectAllMatching()}>Select all {data.total}</Btn> : null}
            <Btn variant="plain" onClick={() => setSelected(new Set())}>Clear</Btn>
            <span className="mx-1 hidden h-5 w-px bg-[#c9c9c9] sm:block" />
            {archivedView ? (
              <Btn disabled={busy} onClick={() => void runBulk("Restored", (ids) => patchMany(ids, { archived_at: null }))}><RotateCcw className="size-3.5" />Restore</Btn>
            ) : (
              <>
                <Btn disabled={busy} onClick={() => void runBulk("Published", (ids) => patchMany(ids, { published: true }))}><Eye className="size-3.5" />Publish</Btn>
                <Btn disabled={busy} onClick={() => void runBulk("Moved to draft", (ids) => patchMany(ids, { published: false }))}><EyeOff className="size-3.5" />Unpublish</Btn>
                <Btn disabled={busy} onClick={() => setDialog("sale")}><Tag className="size-3.5" />Sale</Btn>
                <div className="relative">
                  <Btn disabled={busy} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><Pencil className="size-3.5" />Bulk edit</Btn>
                  {menu ? (
                    <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border border-[#e3e3e3] bg-white py-1 shadow-xl">
                      {BULK_FLAGS.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span>{f.label}</span>
                          <span className="flex gap-1">
                            <button type="button" role="menuitem" className={menuBtn} onClick={() => void runBulk(`${f.label} added`, (ids) => patchMany(ids, { [f.id]: true }))}>Add</button>
                            <button type="button" role="menuitem" className={menuBtn} onClick={() => void runBulk(`${f.label} removed`, (ids) => patchMany(ids, { [f.id]: false }))}>Remove</button>
                          </span>
                        </div>
                      ))}
                      <hr className="my-1 border-[#e3e3e3]" />
                      <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-[#f7f7f7]" onClick={() => { setMenu(false); setDialog("category"); }}>Change category…</button>
                      <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-[#f7f7f7]" onClick={() => void endSale()}>End sale (back to MRP)</button>
                    </div>
                  ) : null}
                </div>
                <Btn variant="danger" disabled={busy} onClick={() => setDialog("delete")}><Trash2 className="size-3.5" />Delete</Btn>
              </>
            )}
          </div>
        ) : null}

        {isError ? (
          <div className="p-6 text-[13px]">
            <p>Something went wrong. Please try again.</p>
            <Btn className="mt-3" onClick={() => void refetch()}>Retry</Btn>
          </div>
        ) : isPending ? (
          <TableSkeleton cols={6} thumb />
        ) : data.rows.length === 0 ? (
          <p className="p-10 text-center text-[13px] text-[#616161]">No products match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr>
                  <th className="w-10 pl-3">
                    <input
                      type="checkbox"
                      aria-label="Select all products on this page"
                      checked={allOnPage}
                      ref={(el) => { if (el) el.indeterminate = !allOnPage && someOnPage; }}
                      onChange={togglePage}
                      className="size-4 accent-[#303030]"
                    />
                  </th>
                  <th className="w-14"></th>
                  <SortTh label="Product" k="name" sort={headSort} onToggle={toggleSort} />
                  <SortTh label="Status" k="status" sort={headSort} onToggle={toggleSort} />
                  <SortTh label="Category" k="category" sort={headSort} onToggle={toggleSort} />
                  <SortTh label="Material" k="material" sort={headSort} onToggle={toggleSort} />
                  <SortTh label="Price" k="price" sort={headSort} onToggle={toggleSort} align="right" />
                  <SortTh label="Updated" k="updated" sort={headSort} onToggle={toggleSort} /><th className="w-[132px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => {
                  const tags = [p.featured && "Featured", p.new_arrival && "New",].filter(Boolean) as string[];
                  return (
                    <tr key={p.id} className={`border-b last:border-0 ${selected.has(p.id) ? "bg-[#f4f6fb]" : ""}`}>
                      <td className="pl-3">
                        <input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="size-4 accent-[#303030]" />
                      </td>
                      <td>
                        {p.product_images[0] ? (
                          <img src={p.product_images[0].image_url} alt="" width={40} height={40} loading="lazy" className="size-10 rounded-lg border border-[#e3e3e3] object-cover" />
                        ) : (
                          <div className="size-10 rounded-lg border border-dashed border-[#c9c9c9] bg-[#f7f7f7]" />
                        )}
                      </td>
                      <td>
                        <Link to="/admin/products/$id/edit" params={{ id: p.id }} className="font-semibold text-[#303030] hover:underline">{p.name}</Link>
                        <p className="text-xs text-[#616161]">{p.sku}{tags.length ? ` · ${tags.join(", ")}` : ""}</p>
                      </td>
                      <td>{statusBadge(p)}</td>
                      <td>{p.category}</td>
                      <td>{p.material}</td>
                      <td className="text-right">
                        {p.price > 0 ? formatPrice(p.price) : <span className="text-[#8a8a8a]">Not set</span>}
                        {p.compare_at_price && p.compare_at_price > p.price ? <s className="block text-xs text-[#8a8a8a]">{formatPrice(p.compare_at_price)}</s> : null}
                      </td>
                      <td className="whitespace-nowrap text-[#616161]">{new Date(p.updated_at).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td>
                        <div className="flex justify-end gap-0.5">
                          <Link to="/admin/products/$id/edit" params={{ id: p.id }} title="Edit" aria-label={`Edit ${p.name}`} className={iconLinkClass}><Pencil className="size-4" /></Link>
                          <IconBtn icon={Download} label="Download CSV" onClick={() => void exportOne(p)} />
                          {!p.archived_at ? (
                            <IconBtn icon={p.published ? EyeOff : Eye} label={p.published ? "Unpublish (make a draft)" : "Publish"} onClick={() => update.mutate({ id: p.id, patch: { published: !p.published } })} />
                          ) : null}
                          {p.archived_at ? (
                            <IconBtn icon={RotateCcw} label="Restore" onClick={() => update.mutate({ id: p.id, patch: { archived_at: null } })} />
                          ) : (
                            <IconBtn icon={Trash2} label="Delete" tone="danger" onClick={() => setConfirm(p)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > ADMIN_PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-[#e3e3e3] px-3 pt-3 text-[13px]">
            <span className="text-[#616161]">Page {page} of {totalPages} · {data.total} products</span>
            <div className="flex gap-1.5">
              <Btn disabled={page === 1} onClick={() => setPage((n) => Math.max(1, n - 1))} aria-label="Previous page"><ChevronLeft className="size-4" /></Btn>
              <Btn disabled={page >= totalPages} onClick={() => setPage((n) => Math.min(totalPages, n + 1))} aria-label="Next page"><ChevronRight className="size-4" /></Btn>
            </div>
          </div>
        ) : null}
      </Card>

      {confirm ? (
        <div role="dialog" aria-modal="true" aria-label="Confirm delete" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[14px] bg-white p-5 shadow-2xl">
            <h2 className="text-[15px] font-semibold">Delete this product?</h2>
            <p className="mt-2 text-[13px] text-[#616161]">“{confirm.name}” will be archived and removed from the public website. You can restore it later from the Archived tab.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Btn onClick={() => setConfirm(null)}>Cancel</Btn>
              <Btn
                variant="primary"
                className="!bg-[#b42318] hover:!bg-[#8e1f0b]"
                onClick={() => {
                  update.mutate({ id: confirm.id, patch: { archived_at: new Date().toISOString(), published: false } });
                  setConfirm(null);
                }}
              >
                Delete
              </Btn>
            </div>
          </div>
        </div>
      ) : null}

      {dialog === "sale" ? <SaleDialog count={selected.size} busy={busy} onCancel={() => setDialog(null)} onApply={(pct) => void applySale(pct)} /> : null}
      {dialog === "category" ? (
        <CategoryDialog
          count={selected.size}
          busy={busy}
          categories={categories ?? []}
          onCancel={() => setDialog(null)}
          onApply={(name) => void runBulk("Category changed", (ids) => patchMany(ids, { category: name }))}
        />
      ) : null}
      {dialog === "delete" ? (
        <div role="dialog" aria-modal="true" aria-label="Confirm bulk delete" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[14px] bg-white p-5 shadow-2xl">
            <h2 className="text-[15px] font-semibold">Delete {selected.size} product{selected.size === 1 ? "" : "s"}?</h2>
            <p className="mt-2 text-[13px] text-[#616161]">They will be archived and removed from the public website. You can restore them later from the Archived tab.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Btn onClick={() => setDialog(null)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={busy}
                className="!bg-[#b42318] hover:!bg-[#8e1f0b]"
                onClick={() => void runBulk("Deleted", (ids) => patchMany(ids, { archived_at: new Date().toISOString(), published: false }))}
              >
                {busy ? "Deleting…" : "Delete"}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function SaleDialog({ count, busy, onCancel, onApply }: { count: number; busy: boolean; onCancel: () => void; onApply: (percent: number) => void }) {
  const [pct, setPct] = useState("20");
  const n = Number(pct);
  const valid = Number.isFinite(n) && n > 0 && n < 100;
  return (
    <div role="dialog" aria-modal="true" aria-label="Put products on sale" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-[14px] bg-white p-5 shadow-2xl">
        <h2 className="text-[15px] font-semibold">Put {count} product{count === 1 ? "" : "s"} on sale</h2>
        <p className="mt-2 text-[13px] text-[#616161]">
          The current price is kept as the MRP (struck through) and the selling price drops by this percentage. Products with size/colour variants are skipped; set their prices on the product page.
        </p>
        <label className="mt-4 block text-[13px] font-medium">
          Discount %
          <input autoFocus inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ""))} className={`${adminInput} mt-1`} />
        </label>
        <div className="mt-2 flex gap-1.5">
          {[10, 20, 30, 50].map((v) => (
            <button key={v} type="button" onClick={() => setPct(String(v))} className="rounded-lg border border-[#c9c9c9] px-2.5 py-1 text-[13px] hover:bg-[#f1f1f1]">{v}%</button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" disabled={!valid || busy} onClick={() => onApply(n)}>{busy ? "Applying…" : "Apply sale"}</Btn>
        </div>
      </div>
    </div>
  );
}

function CategoryDialog({ count, busy, categories, onCancel, onApply }: { count: number; busy: boolean; categories: string[]; onCancel: () => void; onApply: (name: string) => void }) {
  const [name, setName] = useState(categories[0] ?? "");
  return (
    <div role="dialog" aria-modal="true" aria-label="Change category" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-[14px] bg-white p-5 shadow-2xl">
        <h2 className="text-[15px] font-semibold">Change category of {count} product{count === 1 ? "" : "s"}</h2>
        <select value={name} onChange={(e) => setName(e.target.value)} className={`${adminInput} mt-4`}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="mt-5 flex justify-end gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" disabled={!name || busy} onClick={() => onApply(name)}>{busy ? "Saving…" : "Change category"}</Btn>
        </div>
      </div>
    </div>
  );
}
