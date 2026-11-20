import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { iconLinkClass } from "@/components/admin/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, SelectTd, SelectTh, SortTh, useDropMissing, useSelection, useSort } from "@/components/admin/table";
import { db } from "@/lib/data";
import { ChooseFromMedia } from "@/components/admin/MediaPicker";
import { adminCategoriesQuery, slugify } from "@/lib/admin";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({ meta: [{ title: `Categories — ${brand.name} Admin` }] }),
  component: Categories,
});

type Draft = {
  id?: string;
  name: string;
  slug: string;
  sku_code: string;
  description: string;
  image: string;
  parent_id: string;
  sort_order: number;
  published: boolean;
  seo_title: string;
  seo_description: string;
  seo_image_url: string;
};

const empty: Draft = {
  name: "",
  slug: "",
  sku_code: "",
  description: "",
  image: "",
  parent_id: "",
  sort_order: 100,
  published: true,
  seo_title: "",
  seo_description: "",
  seo_image_url: "",
};

function Categories() {
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery(adminCategoriesQuery());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin"] });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.name.trim()) throw new Error("Category name is required.");
      const row = {
        name: d.name.trim(),
        slug: (d.slug.trim() || slugify(d.name)).toLowerCase(),
        sku_code: d.sku_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || null,
        description: d.description.trim() || null,
        image: d.image.trim() || null,
        parent_id: d.parent_id || null,
        sort_order: Number(d.sort_order) || 0,
        published: d.published,
        seo_title: d.seo_title.trim() || null,
        seo_description: d.seo_description.trim() || null,
        seo_image_url: d.seo_image_url.trim() || null,
      };
      if (d.id) {
        const { error } = await db
          .from("categories")
          .update(row)
          .eq("id", d.id);
        if (error) throw error;
        const previous = (data ?? []).find((item: any) => item.id === d.id);
        if (previous && previous.slug !== row.slug) {
          const { error: redirectError } = await db.from("slug_redirects").upsert({ entity_type: "category", source_slug: previous.slug, target_slug: row.slug, source_path: `/category/${previous.slug}`, target_path: `/category/${row.slug}` }, { onConflict: "source_path" });
          if (redirectError) throw redirectError;
        }
      } else {
        const { error } = await db.from("categories").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      invalidate();
      toast.success("Category saved");
    },
    onError: (e: Error) =>
      setError(
        e.message.includes("required")
          ? e.message
          : "Something went wrong. Please try again.",
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Category deleted");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const sel = useSelection();
  const { rows: sortedRows, sort, toggle } = useSort<any>(data ?? [], {
    name: (c) => c.name,
    parent: (c) => (data ?? []).find((p: any) => p.id === c.parent_id)?.name,
    order: (c) => c.sort_order,
    status: (c) => (c.published ? 1 : 0),
  });
  useDropMissing(sel, (data ?? []).map((c: any) => c.id));
  const bulk = useMutation({
    mutationFn: async (a: { ids: string[]; action: "publish" | "hide" | "delete" }) => {
      const table = db.from("categories");
      const { error } = a.action === "delete" ? await table.delete().in("id", a.ids) : await table.update({ published: a.action === "publish" }).in("id", a.ids);
      if (error) throw error;
      return a;
    },
    onSuccess: (a) => {
      invalidate();
      sel.clear();
      toast.success(a.action === "delete" ? "Categories deleted" : a.action === "publish" ? "Categories published" : "Categories hidden");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });
  const selectedIds = [...sel.selected];
  const field =
    "mt-1 w-full border border-border bg-background px-3 py-2 text-sm focus:border-brand-red focus:outline-none";
  const nameOf = (id: string | null) =>
    (data ?? []).find((c: any) => c.id === id)?.name ?? "—";

  return (
    <AdminShell
      title="Categories"
      actions={
        <button
          onClick={() => setDraft({ ...empty })}
          className="eyebrow inline-flex items-center gap-1.5 bg-foreground px-4 py-3 text-background hover:bg-brand-red"
        >
          <Plus className="size-3.5" /> New category
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
            <button disabled={bulk.isPending} onClick={() => { if (window.confirm(`Delete ${selectedIds.length} categor${selectedIds.length === 1 ? "y" : "ies"}? This cannot be undone.`)) bulk.mutate({ ids: selectedIds, action: "delete" }); }} className="border border-border px-3 py-1.5 text-xs hover:border-brand-red disabled:opacity-50">Delete</button>
          </BulkBar>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <SelectTh ids={sortedRows.map((r: any) => r.id)} sel={sel} />
                <SortTh label="Name" k="name" sort={sort} onToggle={toggle} className="p-3" />
                <SortTh label="Parent" k="parent" sort={sort} onToggle={toggle} className="p-3" />
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
                  <td className="p-3">{nameOf(c.parent_id)}</td>
                  <td className="p-3">{c.sort_order}</td>
                  <td className="p-3">{c.published ? "Published" : <span className="text-muted-foreground">Hidden</span>}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() =>
                          setDraft({
                            id: c.id,
                            name: c.name,
                            slug: c.slug,
                            sku_code: c.sku_code ?? "",
                            description: c.description ?? "",
                            image: c.image ?? "",
                            parent_id: c.parent_id ?? "",
                            sort_order: c.sort_order,
                            published: c.published,
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
          aria-label="Category details"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/60 p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(draft);
            }}
            className="w-full max-w-lg border border-border bg-background p-6"
          >
            <h2 className="font-display text-lg">
              {draft.id ? "Edit category" : "New category"}
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
              <label className="text-sm">
                SKU code
                <input
                  value={draft.sku_code}
                  onChange={(e) => setDraft({ ...draft, sku_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) })}
                  placeholder="ER"
                  maxLength={6}
                  className={field}
                />
                <span className="mt-1 block text-xs text-muted-foreground">Starts every product SKU in this category: ER-0001, ER-0002… Leave empty to use the first letters of the name.</span>
              </label>
              <label className="text-sm">
                Parent category
                <select
                  value={draft.parent_id}
                  onChange={(e) =>
                    setDraft({ ...draft, parent_id: e.target.value })
                  }
                  className={field}
                >
                  <option value="">None (top level)</option>
                  {(data ?? [])
                    .filter((c: any) => c.id !== draft.id)
                    .map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
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
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />Published and indexable</label>
              <div className="border-t border-border pt-4 sm:col-span-2">
                <p className="eyebrow">Search & social</p>
                <p className="mt-1 text-xs text-muted-foreground">Optional. Blank fields use the category name, description and image.</p>
              </div>
              <label className="text-sm sm:col-span-2">SEO title<input value={draft.seo_title} onChange={(e) => setDraft({ ...draft, seo_title: e.target.value })} maxLength={60} className={field} /></label>
              <label className="text-sm sm:col-span-2">SEO description<textarea value={draft.seo_description} onChange={(e) => setDraft({ ...draft, seo_description: e.target.value })} maxLength={158} rows={3} className={field} /></label>
              <div className="text-sm sm:col-span-2"><label>Social image URL<input value={draft.seo_image_url} onChange={(e) => setDraft({ ...draft, seo_image_url: e.target.value })} placeholder="https://…" className={field} /></label><ChooseFromMedia onPick={(url) => setDraft((d) => (d ? { ...d, seo_image_url: url } : d))} /></div>
              <label className="text-sm sm:col-span-2">
                Image reference
                <input
                  value={draft.image}
                  onChange={(e) => setDraft({ ...draft, image: e.target.value })}
                  placeholder="Uploaded image address"
                  className={field}
                />
              </label>
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
              Are you sure you want to delete this category?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              “{confirm.name}” will be removed. Products keep their own category
              label.
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
