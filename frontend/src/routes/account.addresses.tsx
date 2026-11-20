import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { accountApi, type SavedAddress } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { INDIAN_STATES, inputClass, labelClass, outlineButton, primaryButton } from "@/lib/commerce";
import { AddressBlock } from "@/components/site/OrderBits";
import { LoadingRows } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/account/addresses")({
  component: AddressesPage,
});

const blank = { id: "", name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false };

function AddressesPage() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["account", "addresses"], queryFn: accountApi.addresses });
  const [form, setForm] = useState<typeof blank | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = (list: { addresses: SavedAddress[] }) => qc.setQueryData(["account", "addresses"], list);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      refresh(await accountApi.saveAddress({ ...(form.id ? { id: form.id } : {}), name: form.name, phone: form.phone, line1: form.line1, line2: form.line2 || null, city: form.city, state: form.state, pincode: form.pincode, isDefault: form.isDefault }));
      toast.success("Address saved");
      setForm(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save the address.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this address?")) return;
    refresh(await accountApi.deleteAddress(id));
  }

  const set = (key: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Addresses</h2>
        {!form ? <button type="button" onClick={() => setForm(blank)} className={primaryButton}>Add address</button> : null}
      </div>

      {form ? (
        <form onSubmit={save} className="mt-6 grid gap-4 border border-border p-5 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="a-name">Full name</label><input id="a-name" required value={form.name} onChange={set("name")} className={`${inputClass} mt-2`} /></div>
          <div><label className={labelClass} htmlFor="a-phone">Phone</label><input id="a-phone" required value={form.phone} onChange={set("phone")} className={`${inputClass} mt-2`} /></div>
          <div className="sm:col-span-2"><label className={labelClass} htmlFor="a-l1">Address</label><input id="a-l1" required value={form.line1} onChange={set("line1")} className={`${inputClass} mt-2`} /></div>
          <div className="sm:col-span-2"><label className={labelClass} htmlFor="a-l2">Apartment, landmark (optional)</label><input id="a-l2" value={form.line2} onChange={set("line2")} className={`${inputClass} mt-2`} /></div>
          <div><label className={labelClass} htmlFor="a-city">City</label><input id="a-city" required value={form.city} onChange={set("city")} className={`${inputClass} mt-2`} /></div>
          <div><label className={labelClass} htmlFor="a-pin">PIN code</label><input id="a-pin" required inputMode="numeric" maxLength={6} value={form.pincode} onChange={set("pincode")} className={`${inputClass} mt-2`} /></div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="a-state">State</label>
            <select id="a-state" required value={form.state} onChange={set("state")} className={`${inputClass} mt-2`}>
              <option value="">Choose a state</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => (f ? { ...f, isDefault: e.target.checked } : f))} className="accent-[var(--brand-red)]" /> Make this my default address
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Save address"}</button>
            <button type="button" onClick={() => setForm(null)} className={outlineButton}>Cancel</button>
          </div>
        </form>
      ) : null}

      {isPending ? (
        <LoadingRows variant="store" />
      ) : data?.addresses.length === 0 && !form ? (
        <p className="mt-6 text-muted-foreground">You haven't saved an address yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {data?.addresses.map((a) => (
            <li key={a.id} className="border border-border p-5">
              {a.isDefault ? <p className="eyebrow mb-2 text-brand-red">Default</p> : null}
              <AddressBlock address={a} />
              <div className="mt-4 flex gap-4 text-sm">
                <button type="button" onClick={() => setForm({ id: a.id, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault })} className="underline hover:text-brand-red">Edit</button>
                <button type="button" onClick={() => void remove(a.id)} className="text-muted-foreground hover:text-brand-red">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
