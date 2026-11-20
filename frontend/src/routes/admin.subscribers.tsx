import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, SelectTd, SelectTh, SortTh, useDropMissing, useSelection, useSort } from "@/components/admin/table";
import { Btn, Card, adminInput, when } from "@/components/admin/ui";
import { downloadTextFile } from "@/lib/csv";
import { db } from "@/lib/data";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/subscribers")({
  head: () => ({ meta: [{ title: `Subscribers — ${brand.name} Admin` }] }),
  component: SubscribersPage,
});

type Row = { id: string; email: string; created_at: string };

function SubscribersPage() {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const sel = useSelection();
  const list = useQuery({
    queryKey: ["admin", "subscribers"],
    queryFn: async () => {
      const { data, error } = await db.from("newsletter_subscribers").select("id,email,created_at").order("created_at", { ascending: false }).limit(5000);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (list.data ?? []).filter((r) => !t || r.email.toLowerCase().includes(t));
  }, [list.data, term]);

  const { rows, sort, toggle } = useSort<Row>(filtered, { email: (r) => r.email, date: (r) => r.created_at });
  useDropMissing(sel, (list.data ?? []).map((r) => r.id));
  const remove = useMutation({
    mutationFn: async (ids: string[]) => api("/admin/subscribers/delete", { method: "POST", body: { ids } }),
    onSuccess: async (_d, ids) => {
      await qc.invalidateQueries({ queryKey: ["admin", "subscribers"] });
      sel.clear();
      toast.success(`${ids.length} subscriber${ids.length === 1 ? "" : "s"} removed`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not remove the subscribers."),
  });
  function exportSelected() {
    const csv = ["Email,Subscribed on", ...rows.filter((r) => sel.has(r.id)).map((r) => `"${r.email.replace(/"/g, '""')}",${r.created_at}`)].join("\r\n");
    downloadTextFile("shop-subscribers-selected.csv", csv);
  }

  function exportCsv() {
    const csv = ["Email,Subscribed on", ...(list.data ?? []).map((r) => `"${r.email.replace(/"/g, '""')}",${r.created_at}`)].join("\r\n");
    downloadTextFile("shop-subscribers.csv", csv);
  }

  return (
    <AdminShell
      title="Newsletter subscribers"
      actions={<Btn onClick={exportCsv} disabled={!list.data?.length}><Download className="size-3.5" /> Export CSV</Btn>}
    >
      <Card flush>
        <BulkBar sel={sel}>
          <Btn onClick={exportSelected}><Download className="size-3.5" /> Export selected</Btn>
          <Btn disabled={remove.isPending} className="!text-[#8e1f0b]" onClick={() => { const ids = [...sel.selected]; if (window.confirm(`Remove ${ids.length} subscriber${ids.length === 1 ? "" : "s"} from the list?`)) remove.mutate(ids); }}><Trash2 className="size-3.5" />Remove</Btn>
        </BulkBar>
        <div className="flex items-center justify-between gap-3 border-b border-[#e3e3e3] px-3 pb-3">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search e-mail" className={`${adminInput} max-w-xs`} />
          <span className="text-[13px] text-[#616161]">{list.data ? `${list.data.length} subscriber${list.data.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        {list.isPending ? (
          <TableSkeleton cols={3} />
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">{list.data?.length ? "No matches" : "No subscribers yet"}</p>
            <p className="mt-1 text-[13px] text-[#616161]">People who sign up in the website footer appear here.</p>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr>
                <SelectTh ids={rows.map((r) => r.id)} sel={sel} />
                <SortTh label="E-mail" k="email" sort={sort} onToggle={toggle} />
                <SortTh label="Subscribed" k="date" sort={sort} onToggle={toggle} className="w-48" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0"><SelectTd id={r.id} label={r.email} sel={sel} /><td>{r.email}</td><td className="text-[#616161]">{when(r.created_at)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminShell>
  );
}
