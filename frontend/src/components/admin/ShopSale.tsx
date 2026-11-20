import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Minus, Plus, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { Btn, Card, adminInput, money } from "@/components/admin/ui";
import { CameraScanner, cameraScanSupported, soldOn, type ScanResult } from "@/components/admin/CameraScanner";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Item = { productId: string; variantId: string | null; name: string; variant: string | null; sku: string | null; price: number; stock: number | null; image: string | null; unitCode?: string | null };
type Line = Item & { qty: number };
type Lookup = ScanResult & { exact: boolean };
type Alert = { title: string; body: string };
type Method = "cash" | "upi" | "card";

const METHODS: { id: Method; label: string }[] = [{ id: "cash", label: "Cash" }, { id: "upi", label: "UPI" }, { id: "card", label: "Card" }];
const keyOf = (i: Item) => i.unitCode ?? `${i.productId}:${i.variantId ?? ""}`;

/** Offline store: scan a barcode (or type a name or SKU), build the sale, pick how it was paid. Uses the website's stock. */
export function ShopSale() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [choices, setChoices] = useState<Item[]>([]);
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [cust, setCust] = useState({ name: "", phone: "", email: "", address: "", dob: "", marketing: false });
  const [looking, setLooking] = useState(false);
  const [last, setLast] = useState<{ number: number; total: number } | null>(null);
  const [camera, setCamera] = useState(false);
  const [alert, setAlert] = useState<Alert | null>(null);

  useEffect(() => input.current?.focus(), []);
  const focus = () => window.setTimeout(() => input.current?.focus(), 0);

  function add(item: Item) {
    setChoices([]);
    setAlert(null);
    setLines((prev) => {
      if (item.unitCode) {
        // One physical piece: it can be in the sale once.
        if (prev.some((l) => l.unitCode === item.unitCode)) {
          toast.error(`${item.unitCode} is already in this sale.`);
          return prev;
        }
        if (item.stock !== null && item.stock <= 0) {
          toast.error(`No stock left of ${item.name}. It may have been sold online.`);
          return prev;
        }
        return [...prev, { ...item, qty: 1 }];
      }
      const at = prev.findIndex((l) => keyOf(l) === keyOf(item));
      if (at >= 0) {
        const l = prev[at]!;
        if (l.stock !== null && l.qty + 1 > l.stock) {
          toast.error(`Only ${l.stock} left of ${l.name}.`);
          return prev;
        }
        return prev.map((x, i) => (i === at ? { ...x, qty: x.qty + 1 } : x));
      }
      if (item.stock !== null && item.stock <= 0) {
        toast.error(`${item.name} is sold out.`);
        return prev;
      }
      return [...prev, { ...item, qty: 1 }];
    });
    setLast(null);
    focus();
  }

  /** Finds a piece by a typed or scanned code and adds it (or offers a short list to choose from). */
  async function lookup(q: string) {
    if (!q) return;
    setLooking(true);
    try {
      const r = await api<Lookup>(`/admin/shop/lookup?q=${encodeURIComponent(q)}`);
      setCode("");
      if (r.unit && r.unit.status !== "in_stock") {
        setChoices([]);
        const it = r.items[0];
        setAlert({ title: "ALREADY SOLD", body: `${it ? `${it.name}${it.variant ? ` · ${it.variant}` : ""}: ` : ""}piece ${r.unit.code} was sold${soldOn(r.unit.soldAt) ? ` on ${soldOn(r.unit.soldAt)}` : ""}${r.unit.orderNumber ? ` (order #${r.unit.orderNumber})` : ""}. It cannot be sold again.` });
        return;
      }
      if (r.needsPiece) {
        setChoices([]);
        setAlert({ title: "Scan the barcode on the piece itself", body: `${r.name ?? "This design"} has a separate barcode on every piece, so the design code ${q} cannot be sold. Scan the label on the piece.` });
        return;
      }
      if (r.items.length === 0) {
        setChoices([]);
        toast.error(`No piece found for "${q}".`);
      } else if (r.exact && r.items.length === 1) {
        add(r.items[0]!);
      } else {
        setChoices(r.items);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not look that up.");
    } finally {
      setLooking(false);
      focus();
    }
  }

  function find(e: FormEvent) {
    e.preventDefault();
    if (!looking) void lookup(code.trim());
  }

  const setQty = (k: string, qty: number) =>
    setLines((prev) => prev.flatMap((l) => (keyOf(l) !== k ? [l] : qty <= 0 ? [] : l.unitCode ? [l] : [{ ...l, qty: l.stock !== null ? Math.min(qty, Math.max(l.stock, 1)) : qty }])));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const pieces = lines.reduce((s, l) => s + l.qty, 0);

  const sell = useMutation({
    mutationFn: () => api<{ number: number; total: number }>("/admin/shop/sale", {
      method: "POST",
      body: { payment_method: method, note: note.trim() || undefined, customer: [cust.name, cust.phone, cust.email, cust.address, cust.dob].some((v) => v.trim()) ? { name: cust.name.trim() || undefined, phone: cust.phone.trim() || undefined, email: cust.email.trim() || undefined, address: cust.address.trim() || undefined, dob: cust.dob || undefined, marketing: cust.marketing } : undefined, lines: lines.map((l) => ({ product_id: l.productId, variant_id: l.variantId, qty: l.qty, unit_code: l.unitCode ?? undefined })) },
    }),
    onSuccess: async (r) => {
      setLast({ number: r.number, total: r.total });
      setLines([]);
      setNote("");
      setCust({ name: "", phone: "", email: "", address: "", dob: "", marketing: false });
      toast.success(`Sale #${r.number} recorded`);
      await qc.invalidateQueries({ queryKey: ["admin"] });
      focus();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not record the sale."),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {camera ? (
        <CameraScanner
          resolve={(c) => api<Lookup>(`/admin/shop/lookup?q=${encodeURIComponent(c)}`)}
          onConfirm={(item) => { setCamera(false); add(item); toast.success(`Added ${item.name}${item.variant ? ` · ${item.variant}` : ""}`); }}
          onClose={() => { setCamera(false); focus(); }}
        />
      ) : null}
      <div className="space-y-4">
        <Card>
          <form onSubmit={find} className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#616161]" aria-hidden="true" />
              <input ref={input} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Scan a barcode, or type a name or SKU and press Enter" aria-label="Scan or search" className={cn(adminInput, "!pl-9 !text-[15px]")} />
            </div>
            <Btn variant="primary" type="submit" disabled={!code.trim() || looking}>{looking ? "…" : "Add"}</Btn>
            <Btn type="button" onClick={() => (cameraScanSupported() ? setCamera(true) : toast.error("This browser cannot scan with the camera. Use Chrome on Android, or a barcode scanner, or type the code."))} aria-label="Scan with the camera"><Camera className="size-4" /><span className="hidden sm:inline"> Camera</span></Btn>
          </form>
          {alert ? (
            <div role="alert" className="mt-3 flex items-start justify-between gap-3 rounded-xl border-2 border-[#c70a24] bg-[#fff1f0] p-4">
              <div><p className="text-[17px] font-bold text-[#8e1f0b]">{alert.title}</p><p className="mt-1 text-[13px] text-[#303030]">{alert.body}</p></div>
              <button type="button" aria-label="Dismiss" onClick={() => { setAlert(null); focus(); }} className="text-[#616161] hover:text-[#303030]"><X className="size-4" /></button>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-[#616161]">Click in the box and scan. Each scan adds one piece; scan the same piece again to add another.</p>

          {choices.length ? (
            <ul className="mt-3 divide-y divide-[#ebebeb] rounded-lg border border-[#e3e3e3]">
              {choices.map((c) => (
                <li key={keyOf(c)}>
                  <button type="button" onClick={() => add(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#fafafa]">
                    <span className="size-9 shrink-0 overflow-hidden rounded-md bg-[#ebebeb]">{c.image ? <img src={c.image} alt="" className="size-full object-cover" /> : null}</span>
                    <span className="min-w-0 flex-1 text-[13px]"><span className="block truncate font-medium">{c.name}{c.variant ? ` · ${c.variant}` : ""}</span><span className="block text-xs text-[#616161]">{c.sku ?? "No SKU"} · {c.stock === null ? "stock not tracked" : `${c.stock} in stock`}</span></span>
                    <span className="text-[13px] font-medium">{money(c.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card title={`This sale${pieces ? ` · ${pieces} piece${pieces === 1 ? "" : "s"}` : ""}`} flush>
          {lines.length === 0 ? (
            <p className="px-4 pb-6 pt-3 text-[13px] text-[#616161]">{last ? `Sale #${last.number} for ${money(last.total)} was recorded. Scan the next piece to start a new sale.` : "Nothing yet. Scan a piece to start."}</p>
          ) : (
            <ul className="divide-y divide-[#ebebeb]">
              {lines.map((l) => (
                <li key={keyOf(l)} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="size-10 shrink-0 overflow-hidden rounded-md bg-[#ebebeb]">{l.image ? <img src={l.image} alt="" className="size-full object-cover" /> : null}</span>
                  <span className="min-w-0 flex-1 text-[13px]"><span className="block font-medium">{l.name}{l.variant ? ` · ${l.variant}` : ""}</span><span className="block text-xs text-[#616161]">{l.unitCode ? `Piece ${l.unitCode}` : l.sku ?? ""} · {money(l.price)}{l.stock !== null ? ` · ${l.stock} in stock` : ""}</span></span>
                  {l.unitCode ? <span className="text-xs text-[#616161]">1 piece</span> : <span className="inline-flex items-center rounded-lg border border-[#c9c9c9]">
                    <button type="button" aria-label="One less" onClick={() => setQty(keyOf(l), l.qty - 1)} className="grid size-8 place-items-center hover:bg-[#f7f7f7]"><Minus className="size-3.5" /></button>
                    <span className="w-8 text-center text-[13px] font-semibold tabular-nums">{l.qty}</span>
                    <button type="button" aria-label="One more" onClick={() => setQty(keyOf(l), l.qty + 1)} className="grid size-8 place-items-center hover:bg-[#f7f7f7]"><Plus className="size-3.5" /></button>
                  </span>}
                  <span className="w-20 text-right text-[13px] font-semibold tabular-nums">{money(l.price * l.qty)}</span>
                  <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setQty(keyOf(l), 0)} className="text-[#616161] hover:text-[#8e1f0b]"><X className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Payment">
        <div className="text-center">
          <p className="text-xs text-[#616161]">Total to collect</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{money(total)}</p>
        </div>
        <fieldset className="mt-4">
          <legend className="text-[13px] font-medium">Paid by</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button key={m.id} type="button" aria-pressed={method === m.id} onClick={() => { setMethod(m.id); focus(); }}
                className={cn("h-11 rounded-lg border text-[13px] font-semibold", method === m.id ? "border-[#303030] bg-[#303030] text-white" : "border-[#c9c9c9] bg-white hover:bg-[#f7f7f7]")}>{m.label}</button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 border-t border-[#ebebeb] pt-3">
          <p className="text-[13px] font-medium">Customer details <span className="font-normal text-[#616161]">(all optional)</span></p>
          <div className="mt-2 grid gap-2">
            <input value={cust.name} maxLength={100} onChange={(e) => setCust({ ...cust, name: e.target.value })} placeholder="Name" autoComplete="off" aria-label="Customer name" className={adminInput} />
            <input value={cust.phone} maxLength={20} inputMode="tel" onChange={(e) => setCust({ ...cust, phone: e.target.value.replace(/[^0-9+()\- ]/g, "") })} placeholder="Mobile number" autoComplete="off" aria-label="Customer mobile number" className={adminInput} />
            <input type="email" value={cust.email} maxLength={160} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="E-mail" autoComplete="off" aria-label="Customer e-mail" className={adminInput} />
            <textarea value={cust.address} maxLength={300} rows={2} onChange={(e) => setCust({ ...cust, address: e.target.value })} placeholder="Address" aria-label="Customer address" className={adminInput} />
            <label className="text-xs text-[#616161]">Date of birth
              <input type="date" value={cust.dob} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCust({ ...cust, dob: e.target.value })} className={`${adminInput} mt-1`} />
            </label>
            <label className="flex items-start gap-2 text-xs text-[#303030]"><input type="checkbox" className="mt-0.5" checked={cust.marketing} onChange={(e) => setCust({ ...cust, marketing: e.target.checked })} /> The customer agrees to receive offers and birthday wishes</label>
          </div>
          <p className="mt-2 text-xs text-[#616161]">With a name, mobile number or e-mail, the customer is saved in Customers (tagged Shop) and found again next time.</p>
        </div>
        <label className="mt-4 block text-[13px]"><span className="font-medium">Note (optional)</span>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="For example customer name or phone" className={`${adminInput} mt-1`} />
        </label>
        <Btn variant="primary" className="mt-4 !h-11 w-full justify-center" disabled={!lines.length || sell.isPending} onClick={() => sell.mutate()}>
          {sell.isPending ? "Recording…" : `Complete sale · ${money(total)}`}
        </Btn>
        <p className="mt-3 text-xs text-[#616161]">Stock goes down straight away, on the website too. The sale appears in Orders and Reports as a shop sale.</p>
      </Card>
    </div>
  );
}
