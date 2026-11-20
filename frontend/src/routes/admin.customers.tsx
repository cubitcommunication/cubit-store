import { brand, LOCALE } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Cake, Download, Gift, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BulkBar, SelectTd, SelectTh, SortTh, useDropMissing, useSelection, useSort } from "@/components/admin/table";
import { Badge, Btn, Card, Field, IconBtn, adminInput, money } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";
import { downloadTextFile } from "@/lib/csv";
import { db } from "@/lib/data";
import { useFeatures } from "@/lib/features";
import { TableSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({ meta: [{ title: `Customers — ${brand.name} Admin` }] }),
  component: CustomersPage,
});

type Customer = { id: string; name: string; email: string | null; phone: string | null; address: string | null; source: string; accepts_marketing: boolean; created_at: string; date_of_birth: string | null; gift_note: string | null; birthday_gift_year: number | null; customer_addresses: { city: string; state: string }[] };

/** Days until the next birthday (0 = today), or null without a date of birth. */
function daysToBirthday(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next.setFullYear(now.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}
type OrderLite = { customer_id: string | null; total: number; status: string };

function CustomersPage() {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [onlyBirthdays, setOnlyBirthdays] = useState(false);
  const { offlineShop } = useFeatures();
  const [source, setSource] = useState<"all" | "online" | "shop">("all");
  const [edit, setEdit] = useState<Customer | null>(null);
  const customers = useQuery({
    queryKey: ["admin", "customers"],
    queryFn: async () => {
      const [c, o] = await Promise.all([
        db.from("customers").select("id,name,email,phone,address,source,accepts_marketing,created_at,date_of_birth,gift_note,birthday_gift_year,customer_addresses(city,state)").order("created_at", { ascending: false }).limit(500),
        db.from("orders").select("customer_id,total,status").not("customer_id", "is", null).limit(5000),
      ]);
      if (c.error) throw new Error(c.error.message);
      return { customers: (c.data ?? []) as unknown as Customer[], orders: (o.data ?? []) as unknown as OrderLite[] };
    },
  });

  const filteredRows = useMemo(() => {
    const stats = new Map<string, { n: number; spent: number }>();
    for (const o of customers.data?.orders ?? []) {
      if (!o.customer_id || o.status === "cancelled") continue;
      const s = stats.get(o.customer_id) ?? { n: 0, spent: 0 };
      s.n += 1;
      s.spent += Number(o.total);
      stats.set(o.customer_id, s);
    }
    const t = term.trim().toLowerCase();
    return (customers.data?.customers ?? [])
      .filter((c) => source === "all" || c.source === source)
      .filter((c) => !t || c.name.toLowerCase().includes(t) || (c.email ?? "").toLowerCase().includes(t) || (c.phone ?? "").includes(t))
      .map((c) => ({ ...c, ...(stats.get(c.id) ?? { n: 0, spent: 0 }), days: daysToBirthday(c.date_of_birth) }))
      .filter((c) => !onlyBirthdays || (c.days !== null && c.days <= 30))
      .sort((a, b) => (onlyBirthdays ? (a.days ?? 999) - (b.days ?? 999) : 0));
  }, [customers.data, term, onlyBirthdays, source]);

  const sel = useSelection();
  const { rows, sort, toggle } = useSort(filteredRows, {
    name: (c) => c.name,
    location: (c) => (c.customer_addresses[0] ? `${c.customer_addresses[0].city}, ${c.customer_addresses[0].state}` : ""),
    birthday: (c) => c.days,
    orders: (c) => c.n,
    marketing: (c) => c.accepts_marketing,
    spent: (c) => c.spent,
  });
  useDropMissing(sel, filteredRows.map((c) => c.id));
  const marketing = useMutation({
    mutationFn: async (a: { ids: string[]; acceptsMarketing: boolean }) => api("/admin/customers/bulk-marketing", { method: "POST", body: a }),
    onSuccess: async (_d, a) => {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      sel.clear();
      toast.success(`${a.ids.length} customer${a.ids.length === 1 ? "" : "s"} ${a.acceptsMarketing ? "subscribed to" : "unsubscribed from"} marketing e-mail`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the customers."),
  });
  function exportSelected() {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = rows
      .filter((c) => sel.has(c.id))
      .map((c) => [q(c.name), q(c.email ?? ""), q(c.phone ?? ""), q(c.customer_addresses[0] ? `${c.customer_addresses[0].city}, ${c.customer_addresses[0].state}` : c.address ?? ""), q(c.date_of_birth ?? ""), c.n, c.accepts_marketing ? "yes" : "no", c.spent].join(","));
    downloadTextFile("shop-customers.csv", ["Name,Email,Phone,Location,Birthday,Orders,Marketing,Spent", ...lines].join("\r\n"));
  }

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/admin/customers/${id}`, { method: "POST", body }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["admin"] }); setEdit(null); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save."),
  });
  const year = new Date().getFullYear();

  return (
    <AdminShell title="Customers">
      <Card flush>
        <BulkBar sel={sel}>
          <Btn disabled={marketing.isPending} onClick={() => marketing.mutate({ ids: [...sel.selected], acceptsMarketing: true })}>Subscribe to marketing</Btn>
          <Btn disabled={marketing.isPending} onClick={() => marketing.mutate({ ids: [...sel.selected], acceptsMarketing: false })}>Unsubscribe</Btn>
          <Btn onClick={exportSelected}><Download className="size-3.5" /> Export CSV</Btn>
        </BulkBar>
        <div className="border-b border-[#e3e3e3] px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {offlineShop ? <div role="tablist" aria-label="Customer source" className="flex overflow-hidden rounded-lg border border-[#c9c9c9] bg-white">
              {([["all", "All"], ["online", "Online"], ["shop", "Shop"]] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={source === id} onClick={() => setSource(id)} className={`px-3 py-1.5 text-[13px] font-medium ${source === id ? "bg-[#303030] text-white" : "hover:bg-[#f7f7f7]"}`}>{label}</button>
              ))}
            </div> : null}
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name, e-mail or mobile" className={`${adminInput} max-w-sm`} />
            <Btn variant={onlyBirthdays ? "primary" : "secondary"} onClick={() => setOnlyBirthdays((v) => !v)}><Cake className="size-3.5" /> Birthdays in the next 30 days</Btn>
          </div>
        </div>
        {customers.isPending ? (
          <TableSkeleton cols={5} />
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">No customers yet</p>
            <p className="mt-1 text-[13px] text-[#616161]">Customers appear here when they create an account. Turn on customer accounts in Store features.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e3e3e3] bg-[#f7f7f7] text-xs text-[#616161]">
                  <SelectTh ids={rows.map((r) => r.id)} sel={sel} />
                  <SortTh label="Customer" k="name" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Location" k="location" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Birthday" k="birthday" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Orders" k="orders" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Marketing" k="marketing" sort={sort} onToggle={toggle} className="px-3 py-2" />
                  <SortTh label="Spent" k="spent" sort={sort} onToggle={toggle} align="right" className="px-3 py-2" />
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-[#ebebeb] last:border-0 hover:bg-[#fafafa]">
                    <SelectTd id={c.id} label={c.name} sel={sel} />
                    <td className="px-3 py-3">
                      <Link to="/admin/orders" search={{ q: c.email || c.phone || c.name }} className="font-semibold hover:underline">{c.name}</Link>
                      {c.source === "shop" ? <span className="ml-1.5 rounded bg-[#e3e3e3] px-1.5 py-0.5 text-[11px] font-medium">Shop</span> : null}
                      <span className="block text-xs text-[#616161]">{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
                    </td>
                    <td className="px-3 py-3 text-[#616161]">{c.customer_addresses[0] ? `${c.customer_addresses[0].city}, ${c.customer_addresses[0].state}` : c.address ? <span className="line-clamp-2 max-w-[14rem] whitespace-pre-wrap">{c.address}</span> : "—"}</td>
                    <td className="px-3 py-3">
                      {c.date_of_birth ? (
                        <div>
                          <p>{new Date(`${c.date_of_birth}T00:00:00`).toLocaleDateString(LOCALE, { day: "numeric", month: "short" })}</p>
                          {c.days !== null && c.days <= 30 ? <Badge tone={c.days === 0 ? "success" : "attention"}>{c.days === 0 ? "Today 🎂" : `In ${c.days} day${c.days === 1 ? "" : "s"}`}</Badge> : null}
                          {c.birthday_gift_year === year ? <p className="mt-0.5 flex items-center gap-1 text-xs text-[#0c5132]"><Gift className="size-3" /> Gift sent</p> : null}
                        </div>
                      ) : <span className="text-[#8a8a8a]">—</span>}
                    </td>
                    <td className="px-3 py-3">{c.n}</td>
                    <td className="px-3 py-3">{c.accepts_marketing ? <Badge tone="success">Subscribed</Badge> : <Badge>Not subscribed</Badge>}</td>
                    <td className="px-3 py-3 text-right font-medium">{money(c.spent)}</td>
                    <td className="px-1 py-3"><IconBtn icon={Pencil} label="Edit customer / set password" onClick={() => setEdit(c)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit ? <EditCustomer c={edit} busy={save.isPending} year={year} onClose={() => setEdit(null)} onSave={(body) => save.mutate({ id: edit.id, body })} /> : null}
    </AdminShell>
  );
}

function EditCustomer({ c, busy, year, onClose, onSave }: { c: Customer; busy: boolean; year: number; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [name, setName] = useState(c.name);
  const [email, setEmail] = useState(c.email ?? "");
  const [address, setAddress] = useState(c.address ?? "");
  const [phone, setPhone] = useState(c.phone ?? "");
  const [marketing, setMarketing] = useState(c.accepts_marketing);
  const [dob, setDob] = useState(c.date_of_birth ?? "");
  const [note, setNote] = useState(c.gift_note ?? "");
  const [sent, setSent] = useState(c.birthday_gift_year === year);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function setPassword() {
    if (pw.length < 8) {
      toast.error("Please use a password of at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      toast.error("The two passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await api(`/admin/customers/${c.id}/password`, { method: "POST", body: { password: pw, password_confirmation: pw2 } });
      toast.success("Password set. The customer is signed out everywhere and can sign in with the new one.");
      setPw("");
      setPw2("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not set the password.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit customer" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <form onSubmit={(e) => { e.preventDefault(); onSave({ name, email, phone, address, acceptsMarketing: marketing, dateOfBirth: dob || null, giftNote: note, birthdayGiftSent: sent }); }}>
          <h2 className="text-[15px] font-semibold">Edit customer</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><input required className={adminInput} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Phone"><input type="tel" className={adminInput} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label={c.source === "shop" ? "E-mail (optional for shop customers)" : "E-mail (the sign-in name)"}><input required={c.source !== "shop"} type="email" className={adminInput} value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Field label="Address"><textarea className={adminInput} rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} /></Field></div>
            <Field label="Date of birth"><input type="date" className={adminInput} value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Gift note (what they love)"><textarea className={adminInput} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /> Subscribed to news</label>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={sent} onChange={(e) => setSent(e.target.checked)} /> Birthday gift sent this year</label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</Btn>
          </div>
        </form>

        <form className="mt-6 border-t border-[#e3e3e3] pt-5" onSubmit={(e) => { e.preventDefault(); void setPassword(); }} noValidate>
          <h3 className="text-[13px] font-semibold">Set a new password</h3>
          <p className="mt-1 text-xs text-[#616161]">For a customer who cannot use the reset e-mail. They are signed out everywhere. Tell them the new password privately.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="New password"><input type="password" autoComplete="new-password" className={adminInput} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Repeat new password"><input type="password" autoComplete="new-password" className={adminInput} value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Btn type="submit" disabled={pwBusy || !pw}>{pwBusy ? "Setting…" : "Set password"}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
