import { createFileRoute } from "@tanstack/react-router";
import { Badge, iconLinkClass } from "@/components/admin/ui";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, SelectTd, SelectTh, SortTh, useDropMissing, useSelection, useSort } from "@/components/admin/table";
import { db } from "@/lib/data";
import { adminCollectionsQuery, slugify } from "@/lib/admin";
import { MATERIALS, OCCASIONS, brand } from "@/config/brand";
import { useAdminCategoryNames } from "@/lib/use-categories";
import { uploadProductImage } from "@/lib/storage";
import { ChooseFromMedia } from "@/components/admin/MediaPicker";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/collections")({
  head: () => ({ meta: [{ title: `Collections — ${brand.name} Admin` }] }),
  component: Collections,
});

type Draft = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  group_name: string;
  category_filter: string;
  material_filter: string;
  occasion_filter: string;
  product_ids: string[];
  navratri_only: boolean;
  diwali_only: boolean;
  published: boolean;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  seo_image_url: string;
};

const empty: Draft = {
  name: "",
  slug: "",
  description: "",
  image: "",
  group_name: "",
  category_filter: "",
  material_filter: "",
  occasion_filter: "",
  product_ids: [],
  navratri_only: false,
  diwali_only: false,
  published: true,
  sort_order: 100,
  seo_title: "",
  seo_description: "",
  seo_image_url: "",
};

function Collections() {
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery(adminCollectionsQuery());
  const [draft, setDraft] = useState<Draft | null>(null);
  const { names: categoryNames } = useAdminCategoryNames(draft?.category_filter);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const productsList = useQuery({
    queryKey: ["admin", "collection-products"],
    enabled: draft !== null,
    queryFn: async () => {
      const { data: rows, error: e } = await db.from("products").select("id,name").eq("published", true).order("name", { ascending: true }).limit(2000);
      if (e) throw new Error(e.message);
      return (rows ?? []) as unknown as { id: string; name: string }[];
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["collections"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.name.trim()) throw new Error("Collection name is required.");
      const row = {
        name: d.name.trim(),
        slug: (d.slug.trim() || slugify(d.name)).toLowerCase(),
        description: d.description.trim() || null,
        image: d.image.trim() || null,
        group_name: d.group_name.trim() || null,
        category_filter: d.category_filter || null,
        material_filter: d.material_filter || null,
        occasion_filter: d.occasion_filter || null,
        product_ids: d.product_ids.length ? d.product_ids : null,
        navratri_only: d.navratri_only,
        diwali_only: d.diwali_only,
        published: d.published,
        sort_order: Number(d.sort_order) || 0,
        seo_title: d.seo_title.trim() || null,
        seo_description: d.seo_description.trim() || null,
        seo_image_url: d.seo_image_url.trim() || null,
      };
      if (d.id) {
        const { error } = await db
          .from("collections")
          .update(row)
          .eq("id", d.id);
        if (error) throw error;
        const previous = (data ?? []).find((item: any) => item.id === d.id);
        if (previous && previous.slug !== row.slug) {
          const { error: redirectError } = await db.from("slug_redirects").upsert({ entity_type: "collection", source_slug: previous.slug, target_slug: row.slug, source_path: `/collection/${previous.slug}`, target_path: `/collection/${row.slug}` }, { onConflict: "source_path" });
          if (redirectError) throw redirectError;
        }
      } else {
        const { error } = await db.from("collections").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      invalidate();
      toast.success("Collection saved");
    },
    onError: (e: Error) =>
      setError(
        e.message.includes("required")
          ? e.message
          : "Something went wrong. Please try again.",
      ),
  });

  const togglePublish = useMutation({
    mutationFn: async (input: { id: string; published: boolean }) => {
      const { error } = await db
        .from("collections")
        .update({ published: input.published })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("collections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Collection deleted");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const sel = useSelection();
  const { rows: sortedRows, sort, toggle } = useSort<any>(data ?? [], {
    name: (c) => c.name,
    group: (c) => c.group_name,
    filters: (c) => c.category_filter || c.material_filter || c.occasion_filter,
    order: (c) => c.sort_order,
    status: (c) => (c.published ? 1 : 0),
  });
  useDropMissing(sel, (data ?? []).map((c: any) => c.id));
  const bulk = useMutation({
    mutationFn: async (a: { ids: string[]; action: "publish" | "hide" | "delete" }) => {
      const table = db.from("collections");
      const { error } = a.action === "delete" ? await table.delete().in("id", a.ids) : await table.update({ published: a.action === "publish" }).in("id", a.ids);
      if (error) throw error;
      return a;
    },
    onSuccess: (a) => {
      invalidate();
      sel.clear();
      toast.success(a.action === "delete" ? "Collections deleted" : a.action === "publish" ? "Collections published" : "Collections hidden");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });
  const selectedIds = [...sel.selected];
  const field =
    "mt-1 w-full border border-border bg-background px-3 py-2 text-sm focus:border-brand-red focus:outline-none";

  return (
    <AdminShell
      title="Collections"
      actions={
        <button
          onClick={() => setDraft({ ...empty })}
          className="eyebrow inline-flex items-center gap-1.5 bg-foreground px-4 py-3 text-background hover:bg-brand-red"
        >
          <Plus className="size-3.5" /> New collection
        </button>
      }
    >
      {isError ? (
        <div className="border border-border bg-background p-6 text-sm">
          <p>Something went wrong. Please try again.</p>
          <button
            onClick={() => void refetch()}
            className="mt-3 border border-border px-3 py-1.5"
          >
            Retry
          </button>
        </div>
      ) : isPending ? (
        <TableSkeleton cols={5} thumb />
      ) : (
        <div className="overflow-x-auto border border-border bg-background">
          <BulkBar sel={sel}>
            <button disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: selectedIds, action: "publish" })} className="border border-border px-3 py-1.5 text-xs hover:border-brand-red disabled:opacity-50">Publish</button>
            <button disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: selectedIds, action: "hide" })} className="border border-border px-3 py-1.5 text-xs hover:border-brand-red disabled:opacity-50">Hide</button>
            <button disabled={bulk.isPending} onClick={() => { if (window.confirm(`Delete ${selectedIds.length} collection${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`)) bulk.mutate({ ids: selectedIds, action: "delete" }); }} className="border border-border px-3 py-1.5 text-xs hover:border-brand-red disabled:opacity-50">Delete</button>
          </BulkBar>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <SelectTh ids={sortedRows.map((r: any) => r.id)} sel={sel} />
                <SortTh label="Name" k="name" sort={sort} onToggle={toggle} className="p-3" />
                <SortTh label="Group" k="group" sort={sort} onToggle={toggle} className="p-3" />
                <SortTh label="Filters" k="filters" sort={sort} onToggle={toggle} className="p-3" />
                <SortTh label="Order" k="order" sort={sort} onToggle={toggle} className="p-3" />
                <SortTh label="Status" k="status" sort={sort} onToggle={toggle} className="p-3" />
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((c: any) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <SelectTd id={c.id} label={c.name} sel={sel} />
                  <td className="p-3">
                    {c.name}
                    <span className="block text-xs text-muted-foreground">
                      /{c.slug}
                    </span>
                  </td>
                  <td className="p-3">{c.group_name ?? "—"}</td>
                  <td className="p-3 text-xs">
                    {[c.category_filter, c.material_filter, c.occasion_filter, Array.isArray(c.product_ids) && c.product_ids.length ? `${c.product_ids.length} hand-picked` : ""]
                      .filter(Boolean)
                      .join(" · ") || "All products"}
                  </td>
                  <td className="p-3">{c.sort_order}</td>
                  <td className="p-3">{c.published ? <Badge tone="success">Published</Badge> : <Badge>Hidden</Badge>}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() =>
                          setDraft({
                            id: c.id,
                            name: c.name,
                            slug: c.slug,
                            description: c.description ?? "",
                            image: c.image ?? "",
                            group_name: c.group_name ?? "",
                            category_filter: c.category_filter ?? "",
                            material_filter: c.material_filter ?? "",
                            occasion_filter: c.occasion_filter ?? "",
                            product_ids: Array.isArray(c.product_ids) ? c.product_ids : [],
                            navratri_only: c.navratri_only,
                            diwali_only: Boolean(c.diwali_only),
                            published: c.published,
                            sort_order: c.sort_order,
                            seo_title: c.seo_title ?? "",
                            seo_description: c.seo_description ?? "",
                            seo_image_url: c.seo_image_url ?? "",
                          })
                        }
                        className={iconLinkClass}
                      title="Edit"
                      aria-label="Edit"
                      ><Pencil className="size-4" /></button>
                      <button
                        onClick={() =>
                          togglePublish.mutate({
                            id: c.id,
                            published: !c.published,
                          })
                        }
                        className={iconLinkClass}
                      title={c.published ? "Unpublish" : "Publish"}
                      aria-label={c.published ? "Unpublish" : "Publish"}
                      >{c.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                      <button
                        onClick={() => setConfirm({ id: c.id, name: c.name })}
                        className={iconLinkClass}
                      title="Delete"
                      aria-label="Delete"
                      ><Trash2 className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Collection details"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/60 p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(draft);
            }}
            className="w-full max-w-xl border border-border bg-background p-6"
          >
            <h2 className="font-display text-lg">
              {draft.id ? "Edit collection" : "New collection"}
            </h2>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-brand-red">
                {error}
              </p>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Name *
                <input
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      name: e.target.value,
                      slug: draft.id ? draft.slug : slugify(e.target.value),
                    })
                  }
                  required
                  className={field}
                />
              </label>
              <label className="text-sm">
                Slug
                <input
                  value={draft.slug}
                  onChange={(e) =>
                    setDraft({ ...draft, slug: slugify(e.target.value) })
                  }
                  className={field}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Description
                <textarea
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  rows={3}
                  className={field}
                />
              </label>
              <label className="text-sm">
                Group heading
                <input
                  value={draft.group_name}
                  onChange={(e) =>
                    setDraft({ ...draft, group_name: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-sm">
                Display order
                <input
                  value={draft.sort_order}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
                  }
                  inputMode="numeric"
                  className={field}
                />
              </label>
              <label className="text-sm">
                Category filter
                <select
                  value={draft.category_filter}
                  onChange={(e) =>
                    setDraft({ ...draft, category_filter: e.target.value })
                  }
                  className={field}
                >
                  <option value="">Any</option>
                  {categoryNames.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Material filter
                <select
                  value={draft.material_filter}
                  onChange={(e) =>
                    setDraft({ ...draft, material_filter: e.target.value })
                  }
                  className={field}
                >
                  <option value="">Any</option>
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Occasion filter
                <select
                  value={draft.occasion_filter}
                  onChange={(e) => setDraft({ ...draft, occasion_filter: e.target.value })}
                  className={field}
                >
                  <option value="">Any</option>
                  {OCCASIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Every product tagged with this occasion appears automatically. For a wedding season collection choose “Bridal” or “Reception”.
                </span>
              </label>
              <div className="text-sm sm:col-span-2">
                Hand-picked products
                <span className="mt-1 block text-xs text-muted-foreground">
                  Add specific products, on top of the filters above. With no filters, only these products are shown.
                </span>
                {draft.product_ids.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {draft.product_ids.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs">
                        {(productsList.data ?? []).find((p) => p.id === id)?.name ?? "Product"}
                        <button type="button" aria-label="Remove" onClick={() => setDraft({ ...draft, product_ids: draft.product_ids.filter((x) => x !== id) })} className="flex size-4 items-center justify-center rounded-full hover:bg-border">×</button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search products to add" className={field} />
                <ul className="mt-2 max-h-44 overflow-y-auto rounded border border-border">
                  {(productsList.data ?? [])
                    .filter((p) => !find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase()))
                    .slice(0, 60)
                    .map((p) => (
                      <li key={p.id}>
                        <label className="flex items-center gap-2 px-2 py-1">
                          <input
                            type="checkbox"
                            checked={draft.product_ids.includes(p.id)}
                            onChange={() => setDraft({ ...draft, product_ids: draft.product_ids.includes(p.id) ? draft.product_ids.filter((x) => x !== p.id) : [...draft.product_ids, p.id] })}
                          />
                          {p.name}
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
              <label className="text-sm sm:col-span-2">
                Collection image
                <input
                  value={draft.image}
                  onChange={(e) => setDraft({ ...draft, image: e.target.value })}
                  placeholder="Uploaded image address"
                  className={field}
                />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label="Upload collection image"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const url = await uploadProductImage(file);
                      setDraft((d) => (d ? { ...d, image: url } : d));
                    } catch {
                      toast.error("Upload failed. Please try again.");
                    }
                  }}
                  className="mt-2 block text-xs"
                />
                <ChooseFromMedia onPick={(url) => setDraft((d) => (d ? { ...d, image: url } : d))} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) =>
                    setDraft({ ...draft, published: e.target.checked })
                  }
                />
                Published
              </label>
              <div className="border-t border-border pt-4 sm:col-span-2">
                <p className="eyebrow">Search & social</p>
                <p className="mt-1 text-xs text-muted-foreground">Optional. Blank fields use the collection name, description and image.</p>
              </div>
              <label className="text-sm sm:col-span-2">SEO title<input value={draft.seo_title} onChange={(e) => setDraft({ ...draft, seo_title: e.target.value })} maxLength={60} className={field} /></label>
              <label className="text-sm sm:col-span-2">SEO description<textarea value={draft.seo_description} onChange={(e) => setDraft({ ...draft, seo_description: e.target.value })} maxLength={158} rows={3} className={field} /></label>
              <div className="text-sm sm:col-span-2"><label>Social image URL<input value={draft.seo_image_url} onChange={(e) => setDraft({ ...draft, seo_image_url: e.target.value })} placeholder="https://…" className={field} /></label><ChooseFromMedia onPick={(url) => setDraft((d) => (d ? { ...d, seo_image_url: url } : d))} /></div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
                className="eyebrow border border-border px-4 py-2.5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={save.isPending}
                className="eyebrow bg-foreground px-4 py-2.5 text-background disabled:opacity-60"
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {confirm ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4"
        >
          <div className="w-full max-w-sm border border-border bg-background p-6">
            <h2 className="font-display text-lg">
              Are you sure you want to delete this collection?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              “{confirm.name}” will be removed. Products are never deleted with a
              collection.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="eyebrow border border-border px-4 py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  remove.mutate(confirm.id);
                  setConfirm(null);
                }}
                className="eyebrow bg-brand-red px-4 py-2.5 text-background"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
