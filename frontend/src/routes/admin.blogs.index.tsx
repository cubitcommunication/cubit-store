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
import { blankBlock, newId, parseTags, slugify, type PageRow } from "@/lib/pages";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/blogs/")({
  head: () => ({ meta: [{ title: `Blog posts — ${brand.name} Admin` }] }),
  component: BlogPosts,
});

type Row = Pick<PageRow, "id" | "title" | "slug" | "published" | "author" | "tags" | "published_at" | "updated_at">;
const utc = (d = new Date()) => d.toISOString().slice(0, 19).replace("T", " ");
const shortDate = (v: string | null) => (v ? new Date(v.replace(" ", "T") + "Z").toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" }) : "—");

function BlogPosts() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const sel = useSelection();

  const posts = useQuery({
    queryKey: ["admin", "posts"],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select("id,title,slug,published,author,tags,published_at,updated_at").eq("kind", "post").order("updated_at", { ascending: false });
      if (error) throw new Error("POSTS_UNAVAILABLE");
      return (data ?? []) as Row[];
    },
  });

  const t = term.trim().toLowerCase();
  const filtered = (posts.data ?? []).filter((p) => !t || p.title.toLowerCase().includes(t) || (p.tags ?? "").toLowerCase().includes(t) || (p.author ?? "").toLowerCase().includes(t));
  const { rows, sort, toggle } = useSort<Row>(filtered, {
    title: (p) => p.title,
    status: (p) => (p.published ? 1 : 0),
    author: (p) => p.author,
    tags: (p) => parseTags(p.tags)[0],
    date: (p) => p.published_at,
    updated: (p) => p.updated_at,
  });
  useDropMissing(sel, (posts.data ?? []).map((p) => p.id));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["post"] });
    void qc.invalidateQueries({ queryKey: ["posts"] });
  };

  const create = useMutation({
    mutationFn: async (name: string) => {
      const id = newId();
      const base = slugify(name) || "post";
      const taken = new Set((posts.data ?? []).map((p) => p.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      const text = { ...blankBlock("text"), heading: name.trim(), body: "Write your post here. Use the Add panel on the left for pictures, columns, buttons and product grids.", align: "left" as const };
      const { error } = await db.from("pages").insert({ id, title: name.trim(), slug, kind: "post", published: false, blocks: [text], published_at: utc() });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      refresh();
      void navigate({ to: "/admin/pages/$id/edit", params: { id } });
    },
    onError: () => toast.error("Could not create the post. Please try again."),
  });

  const setPublished = useMutation({
    mutationFn: async ({ ids, published }: { ids: string[]; published: boolean }) => {
      const { error } = await db.from("pages").update({ published }).in("id", ids).eq("kind", "post");
      if (error) throw error;
      return { n: ids.length, published };
    },
    onSuccess: ({ n, published }) => {
      refresh();
      sel.clear();
      toast.success(`${n} post${n === 1 ? "" : "s"} ${published ? "published" : "moved to drafts"}`);
    },
    onError: () => toast.error("Could not update the posts."),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await db.from("pages").delete().in("id", ids).eq("kind", "post");
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      refresh();
      sel.clear();
      toast.success(`${n} post${n === 1 ? "" : "s"} deleted`);
    },
    onError: () => toast.error("Could not delete the posts."),
  });

  const ids = [...sel.selected];
  const busy = setPublished.isPending || remove.isPending;

  return (
    <AdminShell title="Blog posts" actions={<Btn variant="primary" onClick={() => setCreating(true)}><Plus className="size-3.5" />Write a post</Btn>}>
      <Card flush>
        <div className="flex items-center justify-between gap-3 border-b border-[#e3e3e3] px-3 pb-3">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search title, author or tag" className={`${adminInput} max-w-xs`} />
          <a href="/blog" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-[#005bd3] hover:underline"><ExternalLink className="size-3.5" /> View blog</a>
        </div>

        <BulkBar sel={sel}>
          <Btn disabled={busy} onClick={() => setPublished.mutate({ ids, published: true })}>Publish</Btn>
          <Btn disabled={busy} onClick={() => setPublished.mutate({ ids, published: false })}>Move to drafts</Btn>
          <Btn disabled={busy} onClick={() => { if (window.confirm(`Delete ${ids.length} post${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) remove.mutate(ids); }} className="!text-[#8e1f0b]"><Trash2 className="size-3.5" />Delete</Btn>
        </BulkBar>

        {posts.isPending ? (
          <TableSkeleton cols={4} />
        ) : posts.isError ? (
          <p className="p-6 text-[13px]">Something went wrong. Please try again.</p>
        ) : (posts.data ?? []).length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">No posts yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-[#616161]">Write guides, tips and festive stories. Posts are built with the same page builder as your pages.</p>
            <Btn variant="primary" className="mt-4" onClick={() => setCreating(true)}><Plus className="size-3.5" />Write your first post</Btn>
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-[13px] text-[#616161]">No posts match your search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e3e3e3] bg-[#f7f7f7] text-xs text-[#616161]">
                  <SelectTh ids={rows.map((r) => r.id)} sel={sel} />
                  <SortTh label="Post" k="title" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Status" k="status" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Author" k="author" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Tags" k="tags" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Date" k="date" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Updated" k="updated" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <th className="w-[96px] px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-[#ebebeb] last:border-0 hover:bg-[#fafafa]">
                    <SelectTd id={p.id} label={p.title} sel={sel} />
                    <td className="px-3 py-3">
                      <Link to="/admin/pages/$id/edit" params={{ id: p.id }} className="font-semibold hover:underline">{p.title}</Link>
                      <p className="text-xs text-[#616161]">/blog/{p.slug}</p>
                    </td>
                    <td className="px-3 py-3">{p.published ? <Badge tone="success">Published</Badge> : <Badge tone="attention">Draft</Badge>}</td>
                    <td className="px-3 py-3 text-[#616161]">{p.author || "—"}</td>
                    <td className="px-3 py-3 text-[#616161]">{parseTags(p.tags).join(", ") || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#616161]">{shortDate(p.published_at)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#616161]">{shortDate(p.updated_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-0.5">
                        <Link to="/admin/pages/$id/edit" params={{ id: p.id }} title="Edit" aria-label={`Edit ${p.title}`} className={iconLinkClass}><Pencil className="size-4" /></Link>
                        {p.published ? <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" title="View post" aria-label={`View ${p.title}`} className={iconLinkClass}><ExternalLink className="size-4" /></a> : null}
                        <IconBtn icon={Trash2} label="Delete" tone="danger" onClick={() => { if (window.confirm(`Delete “${p.title}”? This cannot be undone.`)) remove.mutate([p.id]); }} />
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
        <div role="dialog" aria-modal="true" aria-label="Write a post" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form className="w-full max-w-sm rounded-[14px] bg-white p-5 shadow-2xl" onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(title); }}>
            <h2 className="text-[15px] font-semibold">Write a post</h2>
            <div className="mt-4"><Field label="Post title" help="You can change the title and address later."><input autoFocus className={adminInput} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field></div>
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
