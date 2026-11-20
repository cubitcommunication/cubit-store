import { brand } from "@/config/brand";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { LinkPicker } from "@/components/admin/LinkPicker";
import { Btn, Card, adminInput } from "@/components/admin/ui";
import { db } from "@/lib/data";
import { isValidLink } from "@/lib/links";
import { SITE_NAV_FIELDS, type NavItem } from "@/lib/site-settings";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/website-content/navigation")({
  head: () => ({ meta: [{ title: `Navigation — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: NavigationAdmin,
});

const navQuery = () =>
  queryOptions({
    queryKey: ["admin", "site-nav"],
    queryFn: async (): Promise<NavItem[]> => {
      const { data, error } = await db.from("site_nav").select(SITE_NAV_FIELDS).order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as NavItem[]).map((r) => ({ ...r, badge: r.badge ?? "", parent_id: r.parent_id ?? null, new_tab: Boolean(r.new_tab) }));
    },
  });

function NavigationAdmin() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useQuery(navQuery());
  const [rows, setRows] = useState<NavItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin", "site-nav"] });
    await qc.invalidateQueries({ queryKey: ["site-nav"] });
    await router.invalidate();
  };

  const patch = (id: string, change: Partial<NavItem>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const tops = rows.filter((r) => !r.parent_id);
  const kids = (id: string) => rows.filter((r) => r.parent_id === id);

  /** Swap with the neighbour that has the same parent, then renumber everything. */
  function move(id: string, direction: -1 | 1) {
    setRows((list) => {
      const me = list.find((r) => r.id === id);
      if (!me) return list;
      const siblings = list.filter((r) => (r.parent_id ?? null) === (me.parent_id ?? null));
      const i = siblings.findIndex((r) => r.id === id);
      const other = siblings[i + direction];
      if (!other) return list;
      const orderOf = (r: NavItem) => r.sort_order;
      const a = orderOf(me);
      const b = orderOf(other);
      return list.map((r) => (r.id === me.id ? { ...r, sort_order: b } : r.id === other.id ? { ...r, sort_order: a } : r));
    });
  }

  function validate(): string | null {
    for (const r of rows) {
      if (!r.label.trim()) return "Every menu item needs a name.";
      if (!isValidLink(r.path)) return `“${r.label || "A menu item"}” needs a valid link (a page of this site starting with /, or a full https:// address).`;
      if (r.parent_id && rows.find((p) => p.id === r.parent_id)?.parent_id) return "Sub-menus can only be one level deep.";
    }
    if (!tops.some((r) => r.visible)) return "At least one menu item must be shown.";
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      for (const r of rows) {
        const { error } = await db
          .from("site_nav")
          .update({ label: r.label.trim(), path: r.path.trim(), visible: r.visible, sort_order: r.sort_order, badge: (r.badge ?? "").trim().toUpperCase() || null, parent_id: r.parent_id || null, new_tab: Boolean(r.new_tab) })
          .eq("id", r.id);
        if (error) throw error;
      }
      await refresh();
      toast.success("Saved. The menu is updated.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: NavItem) {
    if (item.system) return;
    const children = kids(item.id).length;
    if (!confirm(`Remove “${item.label}” from the menu${children ? ` and its ${children} sub-item${children > 1 ? "s" : ""}` : ""}?`)) return;
    for (const c of kids(item.id)) await db.from("site_nav").delete().eq("id", c.id);
    const { error } = await db.from("site_nav").delete().eq("id", item.id);
    if (error) {
      toast.error("Something went wrong. Please try again.");
      return;
    }
    await refresh();
    toast.success("Removed.");
  }

  async function add(parent: NavItem | null) {
    const siblings = rows.filter((r) => (r.parent_id ?? null) === (parent?.id ?? null));
    const next = (Math.max(0, ...siblings.map((r) => r.sort_order)) || 0) + 10;
    const { error } = await db.from("site_nav").insert({ label: "New item", path: "/shop", sort_order: next, visible: true, system: false, parent_id: parent?.id ?? null, new_tab: false });
    if (error) {
      toast.error("Something went wrong. Please try again.");
      return;
    }
    await refresh();
  }

  const small = "block text-xs font-medium text-[#616161]";

  // A plain function (not a component) so typing in a field never loses focus.
  const renderItem = (r: NavItem, child = false) => {
    const siblings = rows.filter((x) => (x.parent_id ?? null) === (r.parent_id ?? null));
    const i = siblings.findIndex((x) => x.id === r.id);
    const canParent = !kids(r.id).length;
    return (
      <li key={r.id} className={child ? "ml-6 border-l-2 border-[#e3e3e3] pl-3 sm:ml-10" : ""}>
        <div className="grid gap-3 rounded-[12px] border border-[#e3e3e3] bg-white p-3 sm:p-4 lg:grid-cols-[1fr_1.2fr_110px]">
          <label className={small}>
            Menu name
            <input className={`${adminInput} mt-1`} value={r.label} onChange={(e) => patch(r.id, { label: e.target.value })} />
          </label>
          <div className={small}>
            Opens
            {r.system ? (
              <input className={`${adminInput} mt-1 bg-[#f7f7f7]`} value={r.path} disabled aria-label="Opens (fixed page)" />
            ) : (
              <div className="mt-1"><LinkPicker value={r.path} onChange={(v) => patch(r.id, { path: v })} /></div>
            )}
          </div>
          <label className={small}>
            Tag
            <input className={`${adminInput} mt-1 uppercase`} value={r.badge ?? ""} maxLength={20} placeholder="NEW" onChange={(e) => patch(r.id, { badge: e.target.value })} />
          </label>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] lg:col-span-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={r.visible} onChange={(e) => patch(r.id, { visible: e.target.checked })} /> Shown in menu</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(r.new_tab)} onChange={(e) => patch(r.id, { new_tab: e.target.checked })} /> Open in a new tab</label>
            {canParent && !r.system ? (
              <label className="flex items-center gap-2">
                Under
                <select className={`${adminInput} !w-auto !py-1`} value={r.parent_id ?? ""} onChange={(e) => patch(r.id, { parent_id: e.target.value || null })}>
                  <option value="">— Top level —</option>
                  {tops.filter((t) => t.id !== r.id).map((t) => <option key={t.id} value={t.id}>{t.label || "(unnamed)"}</option>)}
                </select>
              </label>
            ) : null}
            <span className="ml-auto flex items-center gap-1">
              <Btn aria-label="Move up" disabled={i <= 0} onClick={() => move(r.id, -1)}><ArrowUp className="size-3.5" /></Btn>
              <Btn aria-label="Move down" disabled={i >= siblings.length - 1} onClick={() => move(r.id, 1)}><ArrowDown className="size-3.5" /></Btn>
              {!child ? <Btn onClick={() => void add(r)} title="Add a sub-menu item under this one"><CornerDownRight className="size-3.5" /> Sub-item</Btn> : null}
              {!r.system ? <Btn variant="danger" aria-label={`Remove ${r.label}`} onClick={() => void remove(r)}><Trash2 className="size-3.5" /></Btn> : null}
            </span>
          </div>
        </div>
      </li>
    );
  };

  return (
    <AdminShell title="Navigation" actions={<Btn variant="primary" onClick={() => void add(null)}><Plus className="size-3.5" /> Add menu item</Btn>}>
      <p className="mt-4 max-w-2xl text-[13px] text-[#616161]">
        This is the menu in the website header, the mobile menu and the footer “Quick links”. Rename items, add a small tag such as NEW, point an item at any page,
        collection, category or outside website, put items under another one as a drop-down, change the order, or hide them. Home, Shop, Collections and Contact are protected so the menu can never break.
        When a season ends, rename or hide its item here — for example turn “Summer Sale” into “Winter Sale”.
      </p>

      {isPending ? (
        <FormSkeleton cards={2} fields={4} />
      ) : isError ? (
        <Card className="mt-6"><p className="text-[13px]">Something went wrong. <Btn onClick={() => void refetch()}>Retry</Btn></p></Card>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {tops.map((r) => (
              <li key={r.id} className="space-y-2">
                <ul>{renderItem(r)}</ul>
                {kids(r.id).length ? <ul className="space-y-2">{kids(r.id).map((c) => renderItem(c, true))}</ul> : null}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center gap-3">
            <Btn variant="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save menu"}</Btn>
            <Btn disabled={saving} onClick={() => data && setRows(data)}>Undo changes</Btn>
          </div>
        </>
      )}
    </AdminShell>
  );
}
