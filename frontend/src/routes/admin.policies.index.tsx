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
import { blankBlock, newId, slugify, sortPolicies, type PageRow } from "@/lib/pages";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/policies/")({
  head: () => ({ meta: [{ title: `Policies — ${brand.name} Admin` }] }),
  component: Policies,
});

type Row = Pick<PageRow, "id" | "title" | "slug" | "published" | "updated_at">;
const shortDate = (v: string | null) => (v ? new Date(v.replace(" ", "T") + "Z").toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" }) : "—");

function Policies() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const sel = useSelection();

  const policies = useQuery({
    queryKey: ["admin", "policies"],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select("id,title,slug,published,updated_at").eq("kind", "policy");
      if (error) throw new Error("POLICIES_UNAVAILABLE");
      return sortPolicies((data ?? []) as Row[]);
    },
  });

  const { rows, sort, toggle } = useSort<Row>(policies.data ?? [], {
    title: (p) => p.title,
    status: (p) => (p.published ? 1 : 0),
    updated: (p) => p.updated_at,
  });
  useDropMissing(sel, (policies.data ?? []).map((p) => p.id));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["policy"] });
    void qc.invalidateQueries({ queryKey: ["policies"] });
  };

  const create = useMutation({
    mutationFn: async (name: string) => {
      const id = newId();
      const base = slugify(name) || "policy";
      const taken = new Set((policies.data ?? []).map((p) => p.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      const text = { ...blankBlock("text"), heading: name.trim(), body: "Write the policy here. Add a new Heading & text block for each section.", align: "left" as const };
      const { error } = await db.from("pages").insert({ id, title: name.trim(), slug, kind: "policy", published: false, blocks: [text] });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      refresh();
      void navigate({ to: "/admin/pages/$id/edit", params: { id } });
    },
    onError: () => toast.error("Could not create the policy. Please try again."),
  });

  const setPublished = useMutation({
    mutationFn: async ({ ids, published }: { ids: string[]; published: boolean }) => {
      const { error } = await db.from("pages").update({ published }).in("id", ids).eq("kind", "policy");
      if (error) throw error;
      return { n: ids.length, published };
    },
    onSuccess: ({ n, published }) => {
      refresh();
      sel.clear();
      toast.success(`${n} polic${n === 1 ? "y" : "ies"} ${published ? "published" : "moved to drafts"}`);
    },
    onError: () => toast.error("Could not update the policies."),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await db.from("pages").delete().in("id", ids).eq("kind", "policy");
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      refresh();
      sel.clear();
      toast.success(`${n} polic${n === 1 ? "y" : "ies"} deleted`);
    },
    onError: () => toast.error("Could not delete the policies."),
  });

  const ids = [...sel.selected];
  const busy = setPublished.isPending || remove.isPending;

  return (
    <AdminShell title="Policies" actions={<Btn variant="primary" onClick={() => setCreating(true)}><Plus className="size-3.5" />Add a policy</Btn>}>
      <p className="mb-3 max-w-2xl text-[13px] text-[#616161]">
        Terms, privacy, refund and shipping policies. Published policies are linked at the bottom of every page of the site, next to Contact Us.
        Review the starting text and make it match how your shop really works before you rely on it.
      </p>
      <Card flush>
        <BulkBar sel={sel}>
          <Btn disabled={busy} onClick={() => setPublished.mutate({ ids, published: true })}>Publish</Btn>
          <Btn disabled={busy} onClick={() => setPublished.mutate({ ids, published: false })}>Move to drafts</Btn>
          <Btn disabled={busy} onClick={() => { if (window.confirm(`Delete ${ids.length} polic${ids.length === 1 ? "y" : "ies"}? This cannot be undone.`)) remove.mutate(ids); }} className="!text-[#8e1f0b]"><Trash2 className="size-3.5" />Delete</Btn>
        </BulkBar>

        {policies.isPending ? (
          <TableSkeleton cols={3} />
        ) : policies.isError ? (
          <p className="p-6 text-[13px]">Something went wrong. Please try again.</p>
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">No policies yet</p>
            <Btn variant="primary" className="mt-4" onClick={() => setCreating(true)}><Plus className="size-3.5" />Add a policy</Btn>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e3e3e3] bg-[#f7f7f7] text-xs text-[#616161]">
                  <SelectTh ids={rows.map((r) => r.id)} sel={sel} />
                  <SortTh label="Policy" k="title" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Status" k="status" sort={sort} onToggle={toggle} className="px-3 py-2" />
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
                      <p className="text-xs text-[#616161]">/policies/{p.slug}</p>
                    </td>
                    <td className="px-3 py-3">{p.published ? <Badge tone="success">Published</Badge> : <Badge tone="attention">Draft</Badge>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#616161]">{shortDate(p.updated_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-0.5">
                        <Link to="/admin/pages/$id/edit" params={{ id: p.id }} title="Edit" aria-label={`Edit ${p.title}`} className={iconLinkClass}><Pencil className="size-4" /></Link>
                        {p.published ? <a href={`/policies/${p.slug}`} target="_blank" rel="noreferrer" title="View" aria-label={`View ${p.title}`} className={iconLinkClass}><ExternalLink className="size-4" /></a> : null}
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
        <div role="dialog" aria-modal="true" aria-label="Add a policy" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form className="w-full max-w-sm rounded-[14px] bg-white p-5 shadow-2xl" onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(title); }}>
            <h2 className="text-[15px] font-semibold">Add a policy</h2>
            <div className="mt-4"><Field label="Policy title" help="For example “Warranty policy”. You can change the title and address later."><input autoFocus className={adminInput} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field></div>
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
