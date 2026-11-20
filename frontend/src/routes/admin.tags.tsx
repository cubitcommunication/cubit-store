import { brand } from "@/config/brand";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Percent, Pencil, Plus, Tag, Trash2, Users, X } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { cleanTag, tagsQuery } from "@/components/admin/TagInput";
import { Btn, Card, adminInput } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { db } from "@/lib/data";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/tags")({
  head: () => ({ meta: [{ title: `Tags — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: TagsPage,
});

type ProductRow = { id: string; name: string; sku: string; archived_at: string | null };

const productsQuery = () => ({
  queryKey: ["admin", "tag-products"] as const,
  queryFn: async () => {
    const { data, error } = await db.from("products").select("id,name,sku,archived_at").order("name", { ascending: true }).limit(3000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as ProductRow[]).filter((p) => !p.archived_at);
  },
});

function TagsPage() {
  const qc = useQueryClient();
  const tags = useQuery(tagsQuery());
  // `null` = closed, "" = a brand-new tag, otherwise the tag being edited.
  const [managing, setManaging] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin", "tags"] }), qc.invalidateQueries({ queryKey: ["admin", "tag-products"] }), qc.invalidateQueries({ queryKey: ["products"] })]);

  const rename = useMutation({
    mutationFn: (v: { from: string; to: string }) => api<{ changed: number }>("/admin/tags/rename", { method: "POST", body: v }),
    onSuccess: async (r) => {
      toast.success(`Tag renamed on ${r.changed} ${r.changed === 1 ? "product" : "products"}`);
      setRenaming(null);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (tag: string) => api<{ changed: number }>("/admin/tags/delete", { method: "POST", body: { tag } }),
    onSuccess: async (r) => {
      toast.success(`Tag removed from ${r.changed} ${r.changed === 1 ? "product" : "products"}`);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = tags.data?.tags ?? [];

  return (
    <AdminShell title="Tags" actions={<Btn variant="primary" onClick={() => setManaging("")}><Plus className="size-3.5" /> Add tag</Btn>}>
      <p className="mb-3 max-w-2xl text-[13px] text-[#616161]">
        Tags are labels you put on products, such as “sale” or “diwali-offer”. Tag the products once, then start a sale by creating a discount for that tag. You can also add tags while editing a product.
      </p>

      <Card flush>
        {tags.isPending ? (
          <TableSkeleton cols={3} />
        ) : tags.isError ? (
          <p className="p-4 text-[13px] text-[#616161]">Could not load tags. <button type="button" className="text-[#005bd3] underline" onClick={() => void tags.refetch()}>Try again</button></p>
        ) : !list.length ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Tag className="size-9 text-[#8a8a8a]" />
            <p className="text-[13px] font-semibold">No tags yet</p>
            <p className="max-w-sm text-xs text-[#616161]">Add a tag like “sale”, pick the products that belong to it, then create a discount for it.</p>
            <Btn variant="primary" onClick={() => setManaging("")}><Plus className="size-3.5" /> Add tag</Btn>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e3e3e3] text-xs text-[#616161]">
                <th className="px-4 py-2 font-medium">Tag</th>
                <th className="px-4 py-2 font-medium">Products</th>
                <th className="px-4 py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.tag} className="border-b border-[#ebebeb] last:border-0">
                  <td className="px-4 py-2.5">
                    {renaming === t.tag ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => { e.preventDefault(); const to = cleanTag(newName); if (to) rename.mutate({ from: t.tag, to }); }}
                      >
                        <input autoFocus value={newName} maxLength={30} onChange={(e) => setNewName(e.target.value)} aria-label="New tag name" className={`${adminInput} !w-48`} />
                        <Btn variant="primary" type="submit" disabled={rename.isPending}>Save</Btn>
                        <Btn onClick={() => setRenaming(null)}>Cancel</Btn>
                      </form>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[#ebebeb] px-2.5 py-0.5 text-[13px] font-medium">{t.tag}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => setManaging(t.tag)} className="inline-flex items-center gap-1.5 text-[#005bd3] hover:underline">
                      <Users className="size-3.5" /> {t.count} {t.count === 1 ? "product" : "products"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Link to="/admin/coupons" search={{ tag: t.tag }} className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9c9] bg-white px-2.5 py-1 text-[13px] font-semibold hover:bg-[#f7f7f7]"><Percent className="size-3.5" /> Create discount</Link>
                      <Btn onClick={() => { setNewName(t.tag); setRenaming(t.tag); }} title="Rename"><Pencil className="size-3.5" /><span className="sr-only">Rename {t.tag}</span></Btn>
                      <Btn
                        variant="danger"
                        title="Delete tag"
                        disabled={remove.isPending}
                        onClick={() => { if (window.confirm(`Remove the tag “${t.tag}” from ${t.count} ${t.count === 1 ? "product" : "products"}? The products themselves are not deleted.`)) remove.mutate(t.tag); }}
                      >
                        <Trash2 className="size-3.5" /><span className="sr-only">Delete {t.tag}</span>
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {managing !== null ? <ManageProducts tag={managing} onClose={() => setManaging(null)} onSaved={() => { setManaging(null); void refresh(); }} /> : null}
    </AdminShell>
  );
}

/** Pick which products carry a tag. Also used to create a new tag (tag = ""). */
function ManageProducts({ tag, onClose, onSaved }: { tag: string; onClose: () => void; onSaved: () => void }) {
  const isNew = tag === "";
  const [name, setName] = useState(tag);
  const [find, setFind] = useState("");
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const products = useQuery(productsQuery());
  const current = useQuery({
    queryKey: ["admin", "tag-members", tag],
    queryFn: () => api<{ ids: string[] }>(`/admin/tags/products?tag=${encodeURIComponent(tag)}`),
    enabled: !isNew,
    staleTime: 0,
  });
  const original = useMemo(() => new Set(isNew ? [] : (current.data?.ids ?? [])), [isNew, current.data]);

  useEffect(() => {
    if (chosen === null && (isNew || current.data)) setChosen(new Set(original));
  }, [chosen, isNew, current.data, original]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: async () => {
      const clean = cleanTag(name);
      if (!clean) throw new Error("Enter a tag name.");
      const sel = chosen ?? new Set<string>();
      const add = [...sel].filter((id) => !original.has(id));
      const drop = [...original].filter((id) => !sel.has(id));
      if (!isNew && clean.toLowerCase() !== tag.toLowerCase()) {
        // A new name for an existing tag: rename first, then apply the product changes under the new name.
        await api("/admin/tags/rename", { method: "POST", body: { from: tag, to: clean } });
      }
      if (add.length) await api("/admin/tags/assign", { method: "POST", body: { tag: clean, mode: "add", ids: add } });
      if (drop.length) await api("/admin/tags/assign", { method: "POST", body: { tag: clean, mode: "remove", ids: drop } });
      if (isNew && !add.length) throw new Error("Choose at least one product for the new tag.");
    },
    onSuccess: () => { toast.success("Tag saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = products.data ?? [];
  const shown = all.filter((p) => !find.trim() || `${p.name} ${p.sku}`.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 300);
  const sel = chosen ?? new Set<string>();
  const toggle = (id: string) => setChosen((c) => { const n = new Set(c ?? []); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ready = Boolean(products.data) && (isNew || Boolean(current.data)) && chosen !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={isNew ? "Add tag" : `Products tagged ${tag}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-[14px] bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-[#e3e3e3] px-4 py-3">
          <h2 className="text-[15px] font-semibold text-[#303030]">{isNew ? "Add tag" : `Products tagged “${tag}”`}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-[#f1f1f1]"><X className="size-4" /></button>
        </header>
        <div className="space-y-3 overflow-y-auto p-4">
          <label className="block text-[13px]">
            <span className="font-medium">Tag name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="sale" className={`${adminInput} mt-1`} />
          </label>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Products</span>
              <span className="text-xs text-[#616161]">{sel.size} selected</span>
            </div>
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search products" aria-label="Search products" className={`${adminInput} mt-1`} />
            {!ready ? (
              <TableSkeleton cols={3} />
            ) : (
              <ul className="mt-2 max-h-64 divide-y divide-[#ebebeb] overflow-y-auto rounded-lg border border-[#e3e3e3]">
                {shown.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f7f7f7]">
                      <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-[#8a8a8a]">{p.sku}</span>
                    </label>
                  </li>
                ))}
                {!shown.length ? <li className="px-3 py-4 text-center text-xs text-[#616161]">No products match.</li> : null}
              </ul>
            )}
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[#e3e3e3] px-4 py-3">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Btn>
        </footer>
      </div>
    </div>
  );
}
