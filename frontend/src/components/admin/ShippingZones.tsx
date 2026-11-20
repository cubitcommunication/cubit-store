import { CURRENCY } from "@/config/brand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Btn, Card, Field, adminInput } from "@/components/admin/ui";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/data";
import { INDIAN_STATES } from "@/lib/commerce";

type Row = { id: string | null; key: string; name: string; states: string[]; rate: string; free: "default" | "never" | "over"; freeOver: string; active: boolean };

let counter = 0;
const blank = (): Row => ({ id: null, key: `new-${++counter}`, name: "", states: [], rate: "", free: "default", freeOver: "", active: true });
const money = (v: string) => v.replace(/[^0-9.]/g, "");
const same = (a: Row[], b: Row[]) => JSON.stringify(a.map(({ key: _k, ...r }) => r)) === JSON.stringify(b.map(({ key: _k, ...r }) => r));

type Stored = { id: string; name: string; states: string[] | string; rate: number | string; free_over: number | string | null; active: boolean | number };

function fromStored(z: Stored): Row {
  const states = typeof z.states === "string" ? (JSON.parse(z.states) as string[]) : z.states;
  const free = z.free_over === null || z.free_over === undefined ? "default" : Number(z.free_over) === 0 ? "never" : "over";
  return { id: z.id, key: z.id, name: z.name, states: states ?? [], rate: String(Number(z.rate)), free, freeOver: free === "over" ? String(Number(z.free_over)) : "", active: Boolean(z.active) };
}

/**
 * Shipping zones, like Shopify: a group of states with its own shipping fee (and, if wanted, its own free-shipping amount).
 * A state that is in no zone pays the standard fee set in "Shipping & limits". The server picks the fee from the delivery
 * state at checkout, so the browser can never change it.
 */
export function ShippingZones({ standardFee, standardFreeOver }: { standardFee: string; standardFreeOver: string }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<Row[]>([]);

  const zones = useQuery({
    queryKey: ["admin", "shipping-zones"],
    queryFn: async () => {
      const { data, error } = await db.from("shipping_zones").select("id,name,states,rate,free_over,active,sort_order").order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Stored[]).map(fromStored);
    },
  });
  useEffect(() => {
    if (zones.data) {
      setRows(zones.data);
      setSaved(zones.data);
    }
  }, [zones.data]);

  const dirty = !same(rows, saved);
  const patch = (key: string, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const takenBy = (state: string, key: string) => rows.find((r) => r.key !== key && r.states.includes(state))?.name || "another zone";
  const problem = rows.find((r) => !r.name.trim() || r.states.length === 0 || r.rate === "" || (r.free === "over" && !(Number(r.freeOver) > 0)));

  const save = useMutation({
    mutationFn: async () => {
      const keep = new Set(rows.map((r) => r.id).filter(Boolean));
      for (const old of saved) {
        if (old.id && !keep.has(old.id)) {
          const { error } = await db.from("shipping_zones").delete().eq("id", old.id);
          if (error) throw new Error(error.message);
        }
      }
      for (const [i, r] of rows.entries()) {
        const body = {
          name: r.name.trim(), states: r.states, rate: Number(r.rate || 0), active: r.active, sort_order: i,
          free_over: r.free === "default" ? null : r.free === "never" ? 0 : Number(r.freeOver),
        };
        const { error } = r.id ? await db.from("shipping_zones").update(body).eq("id", r.id) : await db.from("shipping_zones").insert(body);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "shipping-zones"] });
      toast.success("Shipping zones saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the shipping zones."),
  });

  return (
    <Card
      title="Shipping zones"
      actions={
        <div className="flex gap-2">
          <Btn disabled={!dirty || save.isPending} onClick={() => setRows(saved)}>Discard</Btn>
          <Btn variant="primary" disabled={!dirty || save.isPending || Boolean(problem)} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save zones"}</Btn>
        </div>
      }
    >
      <p className="text-[13px] text-[#616161]">
        Charge a different shipping fee for different states. The fee is picked from the state the customer enters at checkout. A state that is not in any zone pays the standard fee below.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#e3e3e3] bg-[#f7f7f7] px-3 py-2.5 text-[13px]">
        <Badge tone="neutral">Everywhere else</Badge>
        <span>Fee {CURRENCY}{standardFee || "0"}</span>
        <span className="text-[#616161]">· {Number(standardFreeOver) > 0 ? `free over ${CURRENCY}${standardFreeOver}` : "no free shipping"}</span>
        <span className="text-xs text-[#616161]">(set in Shipping &amp; limits)</span>
      </div>

      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={r.key} className={`rounded-lg border p-3 ${r.active ? "border-[#e3e3e3]" : "border-dashed border-[#c9c9c9] bg-[#fafafa]"}`}>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_12rem]">
              <Field label="Zone name"><input value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} placeholder="e.g. Maharashtra & Gujarat" className={adminInput} /></Field>
              <Field label={`Shipping fee (${CURRENCY})`}><input inputMode="decimal" value={r.rate} onChange={(e) => patch(r.key, { rate: money(e.target.value) })} placeholder="0" className={adminInput} /></Field>
              <Field label="Free shipping">
                <select value={r.free} onChange={(e) => patch(r.key, { free: e.target.value as Row["free"] })} className={adminInput}>
                  <option value="default">Same as store (over {CURRENCY}{standardFreeOver || "0"})</option>
                  <option value="over">Over an amount…</option>
                  <option value="never">Never free here</option>
                </select>
              </Field>
            </div>
            {r.free === "over" ? (
              <div className="mt-3 max-w-[12rem]"><Field label={`Free over (${CURRENCY})`}><input inputMode="decimal" value={r.freeOver} onChange={(e) => patch(r.key, { freeOver: money(e.target.value) })} className={adminInput} /></Field></div>
            ) : null}

            <p className="mt-3 flex items-center justify-between text-[13px] font-medium">
              <span>States in this zone <span className="font-normal text-[#616161]">({r.states.length} selected)</span></span>
              <span className="flex gap-3 text-xs font-normal">
                <button type="button" className="text-[#005bd3] hover:underline" onClick={() => patch(r.key, { states: INDIAN_STATES.filter((s) => r.states.includes(s) || !rows.some((o) => o.key !== r.key && o.states.includes(s))) })}>Select all free</button>
                <button type="button" className="text-[#005bd3] hover:underline" onClick={() => patch(r.key, { states: [] })}>Clear</button>
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {INDIAN_STATES.map((s) => {
                const on = r.states.includes(s);
                const used = !on && rows.some((o) => o.key !== r.key && o.states.includes(s));
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={used}
                    title={used ? `Already in ${takenBy(s, r.key)}` : undefined}
                    onClick={() => patch(r.key, { states: on ? r.states.filter((x) => x !== s) : [...r.states, s] })}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-[#303030] bg-[#303030] text-white" : used ? "cursor-not-allowed border-[#ebebeb] text-[#b5b5b5]" : "border-[#c9c9c9] bg-white hover:bg-[#f1f1f1]"}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[#ebebeb] pt-3">
              <label className="flex items-center gap-2 text-[13px]"><Switch checked={r.active} onCheckedChange={(v) => patch(r.key, { active: v })} aria-label="Zone is active" /> {r.active ? "Active" : "Switched off"}</label>
              <Btn variant="danger" onClick={() => setRows((x) => x.filter((z) => z.key !== r.key))}><Trash2 className="size-3.5" /> Delete zone</Btn>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 && !zones.isPending ? <p className="mt-3 text-[13px] text-[#616161]">No zones yet, so every order pays the standard fee.</p> : null}
      {problem ? <p className="mt-3 text-xs text-[#b98900]">Each zone needs a name, a fee and at least one state before it can be saved.</p> : null}

      <div className="mt-3"><Btn onClick={() => setRows((r) => [...r, blank()])}><Plus className="size-3.5" /> Add shipping zone</Btn></div>
    </Card>
  );
}
