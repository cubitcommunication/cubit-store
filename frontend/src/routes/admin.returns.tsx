import { CURRENCY } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Btn, Card, Field, adminInput, when } from "@/components/admin/ui";
import { LoadingRows } from "@/components/ui/loading-rows";
import { formatPrice, brand } from "@/config/brand";
import { api, ApiError } from "@/lib/api";

export const Route = createFileRoute("/admin/returns")({
  head: () => ({ meta: [{ title: `Returns — ${brand.name} Admin` }] }),
  component: ReturnsPage,
});

type Status = "requested" | "approved" | "rejected" | "received" | "refunded" | "closed";
type Item = { name: string; qty: number };
type Row = {
  id: string; orderId: string; orderNumber: number; name: string; email: string; status: Status; reasonLabel: string; details: string | null;
  items: Item[]; adminNote: string | null; refundAmount: number | null; restocked: boolean; createdAt: string; orderTotal: number; paymentStatus: string | null;
};
type Data = { requests: Row[]; counts: Partial<Record<Status, number>>; enabled: boolean };

const TABS: { id: "" | Status; label: string }[] = [
  { id: "", label: "All" }, { id: "requested", label: "New" }, { id: "approved", label: "Approved" },
  { id: "received", label: "Received" }, { id: "refunded", label: "Refunded" }, { id: "rejected", label: "Declined" }, { id: "closed", label: "Closed" },
];
const TONE: Record<Status, "attention" | "info" | "success" | "neutral" | "critical"> = {
  requested: "attention", approved: "info", received: "info", refunded: "success", rejected: "critical", closed: "neutral",
};

function ReturnsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"" | Status>("requested");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(true);
  const [amount, setAmount] = useState("");

  const q = useQuery({ queryKey: ["admin", "returns", tab], queryFn: () => api<Data>(`/admin/returns${tab ? `?status=${tab}` : ""}`), refetchInterval: 60_000 });

  const act = useMutation({
    mutationFn: (v: { id: string; action: string }) => api(`/admin/returns/${v.id}`, { method: "POST", body: { action: v.action, note: note.trim() || undefined, restock: v.action === "received" ? restock : undefined, amount: v.action === "refund" && amount ? Number(amount) : undefined } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      setNote("");
      setAmount("");
      toast.success("Return updated");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the return."),
  });

  const counts = q.data?.counts ?? {};
  return (
    <AdminShell title="Returns">
      {q.data && !q.data.enabled ? (
        <div className="mb-4 rounded-[12px] border border-[#ffd79d] bg-[#fff5ea] p-3 text-[13px]">
          Customers cannot request returns yet. Turn it on in <Link to="/admin/commerce" className="text-[#005bd3] underline">Store features → Returns</Link>. You can still handle requests listed here.
        </div>
      ) : null}

      <div role="tablist" aria-label="Return status" className="mb-4 flex max-w-full overflow-x-auto rounded-lg border border-[#c9c9c9] bg-white sm:inline-flex">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-[13px] font-medium ${tab === t.id ? "bg-[#303030] text-white" : "text-[#303030] hover:bg-[#f7f7f7]"}`}>
            {t.label}{t.id && counts[t.id] ? ` (${counts[t.id]})` : ""}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <Card><LoadingRows /></Card>
      ) : q.isError ? (
        <Card><p className="text-[13px]">Could not load the returns. <Btn onClick={() => void q.refetch()}>Try again</Btn></p></Card>
      ) : q.data.requests.length === 0 ? (
        <Card><p className="py-8 text-center text-[13px] text-[#616161]">No returns here.</p></Card>
      ) : (
        <ul className="space-y-3">
          {q.data.requests.map((r) => {
            const isOpen = open === r.id;
            const canApprove = r.status === "requested";
            const canReceive = r.status === "requested" || r.status === "approved";
            const canRefund = (r.status === "approved" || r.status === "received") && r.paymentStatus === "paid";
            const finished = r.status === "refunded" || r.status === "closed" || r.status === "rejected";
            return (
              <li key={r.id} className="rounded-[12px] border border-[#e3e3e3] bg-white">
                <button type="button" onClick={() => { setOpen(isOpen ? null : r.id); setNote(""); setAmount(""); }} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">
                      Order #{r.orderNumber} · {r.name} <Badge tone={TONE[r.status]}>{r.status}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-[#616161]">{r.items.map((i) => `${i.qty} × ${i.name}`).join(", ")} · {r.reasonLabel}</p>
                  </div>
                  <span className="text-xs text-[#616161]">{when(r.createdAt)}</span>
                </button>

                {isOpen ? (
                  <div className="space-y-3 border-t border-[#ebebeb] p-4 text-[13px]">
                    {r.details ? <p><span className="font-medium">Customer says:</span> {r.details}</p> : null}
                    <p className="text-[#616161]">{r.email} · order total {formatPrice(r.orderTotal)} · payment {r.paymentStatus}{r.refundAmount ? ` · refunded ${formatPrice(r.refundAmount)}` : ""}{r.restocked ? " · stock put back" : ""}</p>
                    {r.adminNote ? <p><span className="font-medium">Your note to the customer:</span> {r.adminNote}</p> : null}
                    <p><Link to="/admin/orders/$id" params={{ id: r.orderId }} className="text-[#005bd3] hover:underline">Open the order</Link></p>

                    {!finished ? (
                      <>
                        <Field label="Note to the customer (shown on their order page)" help="For example the address to send the parcel to, or why it was declined.">
                          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className={adminInput} />
                        </Field>
                        {canReceive ? <label className="flex items-center gap-2"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put the pieces back in stock when received</label> : null}
                        {canRefund ? <div className="max-w-xs"><Field label={`Refund amount (${CURRENCY})`} help={`Leave blank to refund the full ${formatPrice(r.orderTotal)}.`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className={adminInput} /></Field></div> : null}
                        <div className="flex flex-wrap gap-2">
                          {canApprove ? <Btn variant="primary" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "approve" })}>Approve</Btn> : null}
                          {canReceive ? <Btn disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "received" })}>Mark parcel received</Btn> : null}
                          {canRefund ? <Btn variant="primary" disabled={act.isPending} onClick={() => window.confirm("Record this refund on the order?") && act.mutate({ id: r.id, action: "refund" })}>Refund</Btn> : null}
                          {(r.status === "requested" || r.status === "approved") ? <Btn variant="danger" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "reject" })}>Decline</Btn> : null}
                          <Btn disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "close" })}>Close without refund</Btn>
                        </div>
                        {(r.status === "approved" || r.status === "received") && r.paymentStatus !== "paid" ? <p className="text-xs text-[#616161]">This order has no online payment to refund (for example Cash on Delivery). Settle with the customer yourself, then close the return.</p> : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
