import { brand, LOCALE } from "@/config/brand";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, SelectTd, SelectTh, SortTh, useDropMissing, useSelection, useSort } from "@/components/admin/table";
import { Badge, Btn, Card, Field, IconBtn, adminInput, iconLinkClass } from "@/components/admin/ui";
import { db } from "@/lib/data";
import { DEFAULT_BLOCKS } from "@/lib/page-defaults";
import { SYSTEM_PAGES, newId, slugify, systemSlug, type PageRow, type SystemKind } from "@/lib/pages";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/pages/")({
  head: () => ({ meta: [{ title: `Pages — ${brand.name} Admin` }] }),
  component: PagesList,
});

function PagesList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  const pages = useQuery({
    queryKey: ["admin", "pages"],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select("id,title,slug,kind,published,updated_at").eq("kind", "page").order("updated_at", { ascending: false });
      if (error) throw new Error("PAGES_UNAVAILABLE");
      return (data ?? []) as Pick<PageRow, "id" | "title" | "slug" | "kind" | "published" | "updated_at">[];
    },
  });

  const system = useQuery({
    queryKey: ["admin", "system-pages"],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select("id,slug,kind,published,updated_at").in("kind", SYSTEM_PAGES.map((p) => p.kind));
      if (error) throw new Error("PAGES_UNAVAILABLE");
      return (data ?? []) as Pick<PageRow, "id" | "slug" | "kind" | "published" | "updated_at">[];
    },
  });

  /** Opens the editor for a built-in page, creating its starting design (a copy of today's page, unpublished) the first time. */
  const openSystem = useMutation({
    mutationFn: async (kind: SystemKind) => {
      const existing = (system.data ?? []).find((r) => r.kind === kind);
      if (existing) return existing.id;
      const id = newId();
      const meta = SYSTEM_PAGES.find((p) => p.kind === kind)!;
      const { error } = await db.from("pages").insert({ id, title: meta.title, slug: systemSlug(kind), kind, published: false, blocks: DEFAULT_BLOCKS[kind]() });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void navigate({ to: "/admin/pages/$id/edit", params: { id } });
    },
    onError: () => toast.error("Could not open the editor. Please try again."),
  });

  const resetSystem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["page"] });
      toast.success("The built-in design is back.");
    },
    onError: () => toast.error("Could not reset. Please try again."),
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const id = newId();
      const base = slugify(name) || "page";
      // Find a free address: /pages/offers, /pages/offers-2, ...
      const taken = new Set((pages.data ?? []).map((p) => p.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      const { error } = await db.from("pages").insert({ id, title: name.trim(), slug, published: false, blocks: [] });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void navigate({ to: "/admin/pages/$id/edit", params: { id } });
    },
    onError: () => toast.error("Could not create the page. Please try again."),
  });

  const { rows: sortedPages, sort, toggle } = useSort<NonNullable<typeof pages.data>[number]>(pages.data ?? [], {
    title: (p) => p.title,
    status: (p) => (p.published ? 1 : 0),
    updated: (p) => p.updated_at,
  });
  const sel = useSelection();
  useDropMissing(sel, (pages.data ?? []).map((p) => p.id));
  const bulk = useMutation({
    mutationFn: async (a: { ids: string[]; action: "publish" | "draft" | "delete" }) => {
      const table = db.from("pages");
      const { error } = a.action === "delete" ? await table.delete().in("id", a.ids).eq("kind", "page") : await table.update({ published: a.action === "publish" }).in("id", a.ids).eq("kind", "page");
      if (error) throw error;
      return a;
    },
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["page"] });
      sel.clear();
      toast.success(a.action === "delete" ? "Pages deleted" : a.action === "publish" ? "Pages published" : "Pages moved to drafts");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["page"] });
      toast.success("Page deleted");
    },
    onError: () => toast.error("Could not delete the page."),
  });

  return (
    <AdminShell title="Pages" actions={<Btn variant="primary" onClick={() => setCreating(true)}><Plus className="size-3.5" />Create page</Btn>}>
      <h2 className="mb-2 text-[13px] font-semibold">Built-in pages and templates</h2>
      <Card flush>
        <ul className="divide-y divide-[#e3e3e3]">
          {SYSTEM_PAGES.map((meta) => {
            const row = (system.data ?? []).find((r) => r.kind === meta.kind);
            return (
              <li key={meta.kind} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{meta.title}</p>
                  <p className="text-xs text-[#616161]">{meta.help}</p>
                </div>
                {!row ? <Badge>Built-in design</Badge> : row.published ? <Badge tone="success">Your design is live</Badge> : <Badge tone="attention">Draft (built-in design is showing)</Badge>}
                <div className="flex gap-1.5">
                  {meta.path && row?.published ? <a href={meta.path} target="_blank" rel="noreferrer" title="View page" aria-label={`View ${meta.title}`} className={iconLinkClass}><ExternalLink className="size-4" /></a> : null}
                  <Btn disabled={openSystem.isPending || system.isPending} onClick={() => openSystem.mutate(meta.kind)}><Pencil className="size-3.5" />{row ? "Edit" : "Customise"}</Btn>
                  {row ? (
                    <IconBtn icon={Trash2} label="Go back to the built-in design" tone="danger" onClick={() => { if (window.confirm(`Throw away your design of the ${meta.title.toLowerCase()} and go back to the built-in design?`)) resetSystem.mutate(row.id); }} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <h2 className="mb-2 mt-6 text-[13px] font-semibold">Your pages</h2>
      <Card flush>
        <BulkBar sel={sel}>
          <Btn disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: [...sel.selected], action: "publish" })}>Publish</Btn>
          <Btn disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: [...sel.selected], action: "draft" })}>Move to drafts</Btn>
          <Btn disabled={bulk.isPending} className="!text-[#8e1f0b]" onClick={() => { const ids = [...sel.selected]; if (window.confirm(`Delete ${ids.length} page${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) bulk.mutate({ ids, action: "delete" }); }}><Trash2 className="size-3.5" />Delete</Btn>
        </BulkBar>
        {pages.isPending ? (
          <TableSkeleton cols={4} />
        ) : pages.isError ? (
          <p className="p-6 text-[13px]">Something went wrong. Please try again.</p>
        ) : (pages.data ?? []).length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">No pages yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-[#616161]">Build landing pages for offers and festivals from blocks: banners, text, pictures and product grids.</p>
            <Btn variant="primary" className="mt-4" onClick={() => setCreating(true)}><Plus className="size-3.5" />Create your first page</Btn>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr>
                  <SelectTh ids={sortedPages.map((p) => p.id)} sel={sel} />
                  <SortTh label="Page" k="title" sort={sort} onToggle={toggle} />
                  <SortTh label="Status" k="status" sort={sort} onToggle={toggle} />
                  <SortTh label="Updated" k="updated" sort={sort} onToggle={toggle} />
                  <th className="w-[110px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPages.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <SelectTd id={p.id} label={p.title} sel={sel} />
                    <td>
                      <Link to="/admin/pages/$id/edit" params={{ id: p.id }} className="font-semibold text-[#303030] hover:underline">{p.title}</Link>
                      <p className="text-xs text-[#616161]">/pages/{p.slug}</p>
                    </td>
                    <td>{p.published ? <Badge tone="success">Published</Badge> : <Badge tone="attention">Draft</Badge>}</td>
                    <td className="whitespace-nowrap text-[#616161]">{new Date(p.updated_at).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td>
                      <div className="flex justify-end gap-0.5">
                        <Link to="/admin/pages/$id/edit" params={{ id: p.id }} title="Edit" aria-label={`Edit ${p.title}`} className={iconLinkClass}><Pencil className="size-4" /></Link>
                        {p.published ? <a href={`/pages/${p.slug}`} target="_blank" rel="noreferrer" title="View page" aria-label={`View ${p.title}`} className={iconLinkClass}><ExternalLink className="size-4" /></a> : null}
                        <IconBtn icon={Trash2} label="Delete" tone="danger" onClick={() => { if (window.confirm(`Delete “${p.title}”? This cannot be undone.`)) remove.mutate(p.id); }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating ? (
        <div role="dialog" aria-modal="true" aria-label="Create page" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            className="w-full max-w-sm rounded-[14px] bg-white p-5 shadow-2xl"
            onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(title); }}
          >
            <h2 className="text-[15px] font-semibold">Create page</h2>
            <div className="mt-4"><Field label="Page title" help="For example: Diwali offers. You can change the address later."><input autoFocus className={adminInput} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field></div>
            <div className="mt-5 flex justify-end gap-2">
              <Btn onClick={() => { setCreating(false); setTitle(""); }}>Cancel</Btn>
              <Btn variant="primary" type="submit" disabled={!title.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create"}</Btn>
            </div>
          </form>
        </div>
      ) : null}
    </AdminShell>
  );
}
