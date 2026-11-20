import { CURRENCY } from "@/config/brand";
import { brand } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, SelectTd, SelectTh, SortTh, useDropMissing, useSelection, useSort } from "@/components/admin/table";
import { Badge, Btn, Card, Field, adminInput, money, when } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/abandoned")({
  head: () => ({ meta: [{ title: `Abandoned carts — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Abandoned,
});

type CartRow = {
  id: string; email: string; name: string | null; phone: string | null; status: "active" | "reminded" | "recovered" | "expired" | "unsubscribed";
  subtotal: number; items: { name: string; variantTitle: string | null; qty: number }[]; remindersSent: number;
  lastActivityAt: string; lastReminderAt: string | null; clicked: boolean; recoveredTotal: number | null;
};
type Data = {
  carts: CartRow[];
  stats: { waiting: number; waitingValue: number; recovered: number; recoveredValue: number; rate: number; unsubscribed: number };
  settings: Record<string, string>;
  lastRun: string | null;
};

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
const STATUS: Record<CartRow["status"], { label: string; tone: "info" | "attention" | "success" | "neutral" | "critical" }> = {
  active: { label: "Waiting", tone: "info" }, reminded: { label: "Reminded", tone: "attention" }, recovered: { label: "Recovered", tone: "success" },
  expired: { label: "Expired", tone: "neutral" }, unsubscribed: { label: "Unsubscribed", tone: "critical" },
};

function Abandoned() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "abandoned"], queryFn: () => api<Data>("/admin/abandoned"), refetchOnWindowFocus: false });
  const run = useMutation({
    mutationFn: () => api<{ alerts: number; reminders: number; recovered: number; expired: number }>("/admin/abandoned/run", { method: "POST" }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ["admin", "abandoned"] }); toast.success(`Checked: ${r.reminders} reminder${r.reminders === 1 ? "" : "s"} sent, ${r.alerts} alert${r.alerts === 1 ? "" : "s"}`); },
    onError: (e) => toast.error(msg(e)),
  });

  const lastRunAgo = q.data?.lastRun ? Math.round((Date.now() - new Date(q.data.lastRun).getTime()) / 60000) : null;
  const cronOk = lastRunAgo !== null && lastRunAgo <= 30;

  return (
    <AdminShell title="Abandoned carts" actions={<Btn disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? "Checking…" : "Run the check now"}</Btn>}>
      {q.isPending ? <TableSkeleton cols={5} checkbox={false} /> : q.isError ? <p className="text-[13px]">Could not load the abandoned carts. Please refresh.</p> : (
        <div className="space-y-4">
          <p className="max-w-3xl text-[13px] text-[#616161]">
            When a shopper types their e-mail at checkout but does not finish, the cart is kept here. Reminder e-mails go out automatically and you get an alert so you can also call or WhatsApp them.
            The wording of these e-mails is in <Link to="/admin/emails" className="text-[#005bd3] underline">Emails</Link>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Carts waiting" value={String(q.data.stats.waiting)} sub={money(q.data.stats.waitingValue)} />
            <Stat label="Recovered" value={String(q.data.stats.recovered)} sub={money(q.data.stats.recoveredValue)} />
            <Stat label="Recovery rate" value={`${q.data.stats.rate}%`} sub="of carts we followed up" />
            <Stat label="Stopped reminders" value={String(q.data.stats.unsubscribed)} sub="unsubscribed" />
          </div>
          <Card title="Automatic sending">
            <p className="text-[13px]">
              {cronOk ? <><Badge tone="success">Running</Badge> The schedule last ran {lastRunAgo === 0 ? "just now" : `${lastRunAgo} minute${lastRunAgo === 1 ? "" : "s"} ago`}.</> : <><Badge tone="critical">Not running</Badge> {q.data.lastRun ? `The schedule last ran ${when(q.data.lastRun)}.` : "The schedule has not run yet."} Reminders only go out when the server runs <code>php artisan schedule:run</code> every minute — add it as a Cron Job in Hostinger (see DEPLOYMENT.md).</>}
            </p>
          </Card>
          <Settings data={q.data} />
          <CartTable rows={q.data.carts} />
        </div>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4 shadow-[0_1px_0_rgba(26,26,26,0.07)]">
      <p className="text-xs text-[#616161]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="text-xs text-[#616161]">{sub}</p>
    </div>
  );
}

function Settings({ data }: { data: Data }) {
  const qc = useQueryClient();
  const [v, setV] = useState(data.settings);
  const set = (k: string) => (value: string) => setV((s) => ({ ...s, [k]: value }));
  const dirty = JSON.stringify(v) !== JSON.stringify(data.settings);
  const save = useMutation({
    mutationFn: () => api("/admin/abandoned/settings", { method: "POST", body: { values: v } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "abandoned"] }); toast.success("Settings saved"); },
    onError: (e) => toast.error(msg(e)),
  });
  const reminders = Number(v["abandoned_reminders"] ?? "3");
  const num = (k: string, label: string, help: string, unit: string) => (
    <Field label={`${label} (${unit})`} help={help}><input className={adminInput} inputMode="numeric" value={v[k] ?? ""} onChange={(e) => set(k)(e.target.value.replace(/[^0-9.]/g, ""))} /></Field>
  );
  return (
    <Card title="Settings">
      <div className="space-y-4">
        <label className="flex items-start gap-2.5 text-[13px]"><input type="checkbox" className="mt-0.5 size-4 accent-[#303030]" checked={v["abandoned_enabled"] === "1"} onChange={(e) => set("abandoned_enabled")(e.target.checked ? "1" : "0")} /><span><span className="font-medium">Remind shoppers who leave without ordering</span><span className="block text-xs text-[#616161]">Needs checkout switched on in Store features. Only shoppers who typed an e-mail at checkout are included.</span></span></label>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Number of reminders" help="1 to 3 e-mails per cart."><select className={adminInput} value={String(reminders)} onChange={(e) => set("abandoned_reminders")(e.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></Field>
          {num("abandoned_delay_1", "First reminder after", "Time since the shopper last touched the cart.", "minutes")}
          {reminders >= 2 ? num("abandoned_delay_2", "Second reminder after", "Time after the first reminder.", "hours") : null}
          {reminders >= 3 ? num("abandoned_delay_3", "Third reminder after", "Time after the second reminder.", "hours") : null}
          {num("abandoned_expire_days", "Give up after", "A cart with no activity this long is closed.", "days")}
          {num("abandoned_min_value", "Ignore carts below", "0 = follow up on every cart.", `${CURRENCY}`)}
          <Field label="Discount code to offer (optional)" help="Create it in Discounts first; it appears in the e-mails as {{coupon_code}}."><input className={adminInput} value={v["abandoned_coupon_code"] ?? ""} maxLength={60} onChange={(e) => set("abandoned_coupon_code")(e.target.value.toUpperCase().replace(/\s/g, ""))} /></Field>
        </div>
        <div className="rounded-lg border border-[#e3e3e3] p-3">
          <label className="flex items-start gap-2.5 text-[13px]"><input type="checkbox" className="mt-0.5 size-4 accent-[#303030]" checked={v["abandoned_notify_admin"] === "1"} onChange={(e) => set("abandoned_notify_admin")(e.target.checked ? "1" : "0")} /><span><span className="font-medium">E-mail me when a cart is abandoned</span><span className="block text-xs text-[#616161]">Goes to the alert addresses in Emails, with the shopper's contact details and basket.</span></span></label>
          {v["abandoned_notify_admin"] === "1" ? <div className="mt-3 max-w-xs">{num("abandoned_admin_after_minutes", "Alert me after", "Minutes without activity.", "minutes")}</div> : null}
        </div>
        <div className="flex justify-end"><Btn variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save settings"}</Btn></div>
      </div>
    </Card>
  );
}

function CartTable({ rows: all }: { rows: CartRow[] }) {
  const qc = useQueryClient();
  const sel = useSelection();
  const { rows, sort, toggle } = useSort<CartRow>(all, {
    shopper: (c) => c.name || c.email, value: (c) => c.subtotal, status: (c) => c.status, reminders: (c) => c.remindersSent, activity: (c) => c.lastActivityAt,
  });
  useDropMissing(sel, all.map((c) => c.id));
  const act = useMutation({
    mutationFn: (a: { ids: string[]; action: "send" | "delete" }) => api<{ done: number; skipped: number }>("/admin/abandoned/actions", { method: "POST", body: a }).then((r) => ({ ...r, action: a.action })),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["admin", "abandoned"] });
      sel.clear();
      toast.success(r.action === "send" ? `${r.done} reminder${r.done === 1 ? "" : "s"} sent${r.skipped ? `, ${r.skipped} skipped` : ""}` : `${r.done} deleted`);
    },
    onError: (e) => toast.error(msg(e)),
  });
  const ids = [...sel.selected];

  return (
    <Card title={`Carts (${all.length})`} flush>
      <BulkBar sel={sel}>
        <Btn disabled={act.isPending} onClick={() => act.mutate({ ids, action: "send" })}><Mail className="size-3.5" />Send next reminder now</Btn>
        <Btn disabled={act.isPending} className="!text-[#8e1f0b]" onClick={() => { if (window.confirm(`Delete ${ids.length} cart${ids.length === 1 ? "" : "s"}?`)) act.mutate({ ids, action: "delete" }); }}><Trash2 className="size-3.5" />Delete</Btn>
      </BulkBar>
      {all.length === 0 ? (
        <p className="px-6 py-12 text-center text-[13px] text-[#616161]">No abandoned carts yet. They appear here when a shopper types their e-mail at checkout and does not finish the order.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e3e3e3] bg-[#f7f7f7] text-xs text-[#616161]">
                <SelectTh ids={rows.map((r) => r.id)} sel={sel} />
                <SortTh label="Shopper" k="shopper" sort={sort} onToggle={toggle} className="px-3 py-2" />
                <th className="px-3 py-2 font-medium">Items</th>
                <SortTh label="Value" k="value" sort={sort} onToggle={toggle} className="px-3 py-2" align="right" />
                <SortTh label="Status" k="status" sort={sort} onToggle={toggle} className="px-3 py-2" />
                <SortTh label="Reminders" k="reminders" sort={sort} onToggle={toggle} className="px-3 py-2" />
                <SortTh label="Last activity" k="activity" sort={sort} onToggle={toggle} className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-[#ebebeb] align-top last:border-0 hover:bg-[#fafafa]">
                  <SelectTd id={c.id} label={c.email} sel={sel} />
                  <td className="px-3 py-3"><p className="font-semibold">{c.name || "—"}</p><p className="text-xs text-[#616161]">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p></td>
                  <td className="max-w-[260px] px-3 py-3 text-[#616161]">{c.items.map((i) => `${i.name}${i.variantTitle ? ` (${i.variantTitle})` : ""} × ${i.qty}`).join(", ")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">{money(c.recoveredTotal ?? c.subtotal)}</td>
                  <td className="px-3 py-3"><Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>{c.clicked && c.status !== "recovered" ? <p className="mt-1 text-xs text-[#616161]">Opened the link</p> : null}</td>
                  <td className="px-3 py-3">{c.remindersSent}{c.lastReminderAt ? <p className="text-xs text-[#616161]">last {when(c.lastReminderAt)}</p> : null}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-[#616161]">{when(c.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
