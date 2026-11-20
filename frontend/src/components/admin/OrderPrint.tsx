import { CURRENCY, LOCALE } from "@/config/brand";
import { brand } from "@/config/brand";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { Printer } from "lucide-react";
import { Btn } from "@/components/admin/ui";
import { useContactInfo, useSiteText } from "@/lib/site-settings";
import { useRootSettingsValue } from "@/lib/print-settings";

/** What the printer needs for one order. */
export type PrintOrder = {
  number: number;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  discount_total: number;
  coupon_code: string | null;
  shipping_total: number;
  cod_fee: number;
  total: number;
  notes: string | null;
  shipping_address: { name: string; phone: string; line1: string; line2?: string | null; city: string; state: string; pincode: string } | null;
  order_items: { name: string; variant_title?: string | null; sku: string; price: number; quantity: number; line_total: number }[];
};

export type PrintSize = "4x6" | "a6" | "4x3" | "a4";

export const PRINT_SIZES: { id: PrintSize; label: string; hint: string; width: string; height: string }[] = [
  { id: "4x6", label: "Shipping label — 4 × 6 in", hint: "Thermal label printers", width: "100mm", height: "150mm" },
  { id: "a6", label: "Shipping label — A6", hint: "Sticker sheets, 105 × 148 mm", width: "105mm", height: "148mm" },
  { id: "4x3", label: "Small label — 4 × 3 in", hint: "100 × 75 mm, address only", width: "100mm", height: "75mm" },
  { id: "a4", label: "Packing slip / invoice — A4", hint: "Normal paper", width: "210mm", height: "297mm" },
];

const inr = (n: number) => {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `${CURRENCY}${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n)}`;
};
const day = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });

function Barcode({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", width: 2, height, displayValue: false, margin: 0 });
    } catch {
      /* the number is still printed in words below */
    }
  }, [value, height]);
  return <svg ref={ref} className="bar" aria-hidden="true" />;
}

type From = { brand: string; address: string; phone: string; email: string; website: string };

function ShipTo({ o }: { o: PrintOrder }) {
  const a = o.shipping_address;
  if (!a) return <p>No address</p>;
  return (
    <div className="to">
      <p className="tag">SHIP TO</p>
      <p className="name">{a.name}</p>
      <p>{a.line1}</p>
      {a.line2 ? <p>{a.line2}</p> : null}
      <p>{a.city}, {a.state}</p>
      <p className="pin">PIN {a.pincode}</p>
      <p className="ph">☎ {a.phone}</p>
    </div>
  );
}

function PayBox({ o }: { o: PrintOrder }) {
  const cod = o.payment_method === "cod" && o.payment_status !== "paid";
  return (
    <div className={cod ? "pay cod" : "pay"}>
      {cod ? (
        <>
          <span>CASH ON DELIVERY</span>
          <strong>Collect {inr(Number(o.total))}</strong>
        </>
      ) : (
        <strong>PREPAID — do not collect</strong>
      )}
    </div>
  );
}

function Label({ o, from, compact }: { o: PrintOrder; from: From; compact: boolean }) {
  const pieces = o.order_items.reduce((n, i) => n + Number(i.quantity), 0);
  const shown = o.order_items.slice(0, compact ? 0 : 6);
  const more = o.order_items.length - shown.length;
  return (
    <section className="sheet label">
      <header className="head">
        <div>
          <p className="brand">{brand.name}</p>
          <p className="small">{from.website}</p>
        </div>
        <div className="right">
          <p className="ord">ORDER #{o.number}</p>
          <p className="small">{day(o.created_at)} · {pieces} {pieces === 1 ? "piece" : "pieces"}</p>
        </div>
      </header>
      <div className="barwrap">
        <Barcode value={String(o.number)} height={compact ? 34 : 52} />
        <p className="barnum">{o.number}</p>
      </div>
      <ShipTo o={o} />
      <PayBox o={o} />
      {shown.length ? (
        <table className="items">
          <tbody>
            {shown.map((i, n) => (
              <tr key={n}><td className="q">{i.quantity}×</td><td>{i.name}{i.variant_title ? ` (${i.variant_title})` : ""}</td><td className="sku">{i.sku}</td></tr>
            ))}
            {more > 0 ? <tr><td /><td colSpan={2}>+ {more} more item{more > 1 ? "s" : ""}</td></tr> : null}
          </tbody>
        </table>
      ) : null}
      <footer className="from">
        <p className="tag">FROM</p>
        <p><strong>{from.brand}</strong>{from.address ? ` · ${from.address.replace(/\s*\n\s*/g, ", ")}` : ""}</p>
        <p>{[from.phone && `☎ ${from.phone}`, from.email].filter(Boolean).join("  ·  ")}</p>
      </footer>
    </section>
  );
}

function Slip({ o, from }: { o: PrintOrder; from: From }) {
  const a = o.shipping_address;
  return (
    <section className="sheet slip">
      <header className="slip-head">
        <div>
          <p className="brand big">{brand.name}</p>
          <p className="small">{from.address.replace(/\n/g, ", ")}{from.address ? " · " : ""}{from.phone} · {from.email}</p>
        </div>
        <div className="right">
          <p className="ord big">Order #{o.number}</p>
          <p className="small">{day(o.created_at)}</p>
          <Barcode value={String(o.number)} height={36} />
        </div>
      </header>
      <div className="cols">
        <div>
          <p className="tag">SHIP TO</p>
          {a ? <p>{a.name}<br />{a.line1}<br />{a.line2 ? <>{a.line2}<br /></> : null}{a.city}, {a.state} {a.pincode}<br />☎ {a.phone}</p> : null}
        </div>
        <div>
          <p className="tag">CONTACT</p>
          <p>{o.name}<br />{o.email}<br />{o.phone}</p>
        </div>
        <div>
          <p className="tag">PAYMENT</p>
          <p>{o.payment_method === "cod" ? "Cash on Delivery" : "Online"}<br />{o.payment_status === "paid" ? "Paid" : o.payment_method === "cod" ? `Collect ${inr(Number(o.total))}` : "Payment pending"}</p>
        </div>
      </div>
      <table className="lines">
        <thead><tr><th>Item</th><th>SKU</th><th className="num">Price</th><th className="num">Qty</th><th className="num">Total</th></tr></thead>
        <tbody>
          {o.order_items.map((i, n) => (
            <tr key={n}><td>{i.name}{i.variant_title ? ` (${i.variant_title})` : ""}</td><td>{i.sku}</td><td className="num">{inr(Number(i.price))}</td><td className="num">{i.quantity}</td><td className="num">{inr(Number(i.line_total))}</td></tr>
          ))}
        </tbody>
      </table>
      <dl className="totals">
        <div><dt>Subtotal</dt><dd>{inr(Number(o.subtotal))}</dd></div>
        {Number(o.discount_total) > 0 ? <div><dt>Discount{o.coupon_code ? ` (${o.coupon_code})` : ""}</dt><dd>−{inr(Number(o.discount_total))}</dd></div> : null}
        <div><dt>Shipping</dt><dd>{Number(o.shipping_total) > 0 ? inr(Number(o.shipping_total)) : "Free"}</dd></div>
        {Number(o.cod_fee) > 0 ? <div><dt>COD fee</dt><dd>{inr(Number(o.cod_fee))}</dd></div> : null}
        <div className="grand"><dt>Total</dt><dd>{inr(Number(o.total))}</dd></div>
      </dl>
      {o.notes ? <p className="note"><strong>Customer note:</strong> {o.notes}</p> : null}
      <p className="thanks">Thank you for shopping with {brand.name} — {from.website}</p>
    </section>
  );
}

function css(size: (typeof PRINT_SIZES)[number]): string {
  const small = size.id === "4x3";
  return `
@page { size: ${size.width} ${size.height}; margin: 0; }
@media screen { #print-root { display: none; } }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not(#print-root) { display: none !important; }
  #print-root { display: block; }
}
#print-root, #print-root * { box-sizing: border-box; }
#print-root { font-family: Arial, Helvetica, sans-serif; color: #000; }
#print-root p { margin: 0; }
#print-root .sheet { width: ${size.width}; height: ${size.height}; overflow: hidden; page-break-after: always; break-after: page; padding: ${size.id === "a4" ? "14mm" : small ? "3mm" : "4mm"}; }
#print-root .sheet:last-child { page-break-after: auto; break-after: auto; }
#print-root .label { display: flex; flex-direction: column; gap: ${small ? "1.5mm" : "2.5mm"}; border: 0.4mm solid #000; }
#print-root .head { display: flex; justify-content: space-between; align-items: flex-start; }
#print-root .head .right { text-align: right; }
#print-root .brand { font-size: ${small ? "13pt" : "17pt"}; font-weight: 800; letter-spacing: 0.18em; }
#print-root .brand.big { font-size: 24pt; }
#print-root .ord { font-size: ${small ? "11pt" : "14pt"}; font-weight: 800; }
#print-root .ord.big { font-size: 16pt; }
#print-root .small { font-size: ${small ? "6.5pt" : "8pt"}; color: #222; }
#print-root .barwrap { text-align: center; }
#print-root .bar { display: block; margin: 0 auto; width: 90%; height: ${small ? "9mm" : "14mm"}; }
#print-root .barnum { font-size: 9pt; letter-spacing: 0.3em; margin-top: 0.8mm; }
#print-root .tag { font-size: ${small ? "6.5pt" : "7.5pt"}; font-weight: 700; letter-spacing: 0.2em; color: #333; margin-bottom: 0.8mm; }
#print-root .to { border-top: 0.3mm solid #000; border-bottom: 0.3mm solid #000; padding: ${small ? "1.5mm 0" : "2.5mm 0"}; }
#print-root .to p { font-size: ${small ? "9.5pt" : "12.5pt"}; line-height: 1.3; }
#print-root .to .name { font-size: ${small ? "12pt" : "16pt"}; font-weight: 800; }
#print-root .to .pin { font-size: ${small ? "14pt" : "20pt"}; font-weight: 800; letter-spacing: 0.12em; margin-top: 0.8mm; }
#print-root .to .ph { font-weight: 700; margin-top: 0.8mm; }
#print-root .pay { border: 0.5mm solid #000; padding: 1.8mm 2.5mm; text-align: center; }
#print-root .pay span { display: block; font-size: ${small ? "7pt" : "9pt"}; font-weight: 700; letter-spacing: 0.15em; }
#print-root .pay strong { display: block; font-size: ${small ? "12pt" : "17pt"}; }
#print-root .pay.cod { background: #000; color: #fff; }
#print-root .items { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
#print-root .items td { padding: 0.5mm 1mm 0.5mm 0; vertical-align: top; }
#print-root .items .q { width: 8mm; font-weight: 700; }
#print-root .items .sku { text-align: right; color: #444; font-size: 7.5pt; white-space: nowrap; }
#print-root .from { margin-top: auto; border-top: 0.3mm dashed #000; padding-top: 1.5mm; }
#print-root .from p { font-size: ${small ? "7pt" : "8.5pt"}; line-height: 1.35; }
#print-root .slip { font-size: 10.5pt; }
#print-root .slip-head { display: flex; justify-content: space-between; border-bottom: 0.5mm solid #000; padding-bottom: 5mm; }
#print-root .slip-head .right { text-align: right; }
#print-root .slip-head .bar { width: 48mm; height: 11mm; margin-left: auto; margin-top: 2mm; }
#print-root .cols { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 8mm; margin: 7mm 0; line-height: 1.45; }
#print-root .lines { width: 100%; border-collapse: collapse; }
#print-root .lines th { text-align: left; font-size: 8.5pt; letter-spacing: 0.1em; text-transform: uppercase; border-bottom: 0.4mm solid #000; padding: 2mm 1mm; }
#print-root .lines td { padding: 2.2mm 1mm; border-bottom: 0.2mm solid #bbb; }
#print-root .num { text-align: right; }
#print-root .totals { width: 70mm; margin: 6mm 0 0 auto; }
#print-root .totals div { display: flex; justify-content: space-between; padding: 1mm 0; }
#print-root .totals dt, #print-root .totals dd { margin: 0; }
#print-root .totals .grand { border-top: 0.4mm solid #000; margin-top: 1.5mm; padding-top: 2mm; font-weight: 800; font-size: 12.5pt; }
#print-root .note { margin-top: 8mm; font-size: 9.5pt; }
#print-root .thanks { margin-top: 14mm; text-align: center; font-size: 9.5pt; letter-spacing: 0.08em; }
`;
}

/**
 * Prints an order at the chosen paper size. The sheet is rendered off-screen and shown only while
 * printing; @page tells the browser (and so the printer driver) the exact label size.
 */
export function OrderPrintMenu({ order }: { order: PrintOrder }) {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<PrintSize | null>(null);
  const contact = useContactInfo();
  const text = useSiteText();
  const returnAddress = useRootSettingsValue("return_address");

  useEffect(() => {
    if (!job) return;
    const done = () => setJob(null);
    window.addEventListener("afterprint", done);
    // Let the barcode draw first, then open the print dialog.
    const t = window.setTimeout(() => window.print(), 250);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [job]);

  void text;
  const from: From = {
    brand: brand.name,
    address: returnAddress,
    phone: contact.phoneDisplay,
    email: contact.email,
    website: contact.websiteLabel || brand.websiteLabel,
  };
  const size = PRINT_SIZES.find((s) => s.id === job);

  return (
    <div className="relative">
      <Btn onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}><Printer className="size-3.5" /> Print</Btn>
      {open ? (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <ul role="menu" className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-xl border border-[#e3e3e3] bg-white py-1 shadow-lg">
            {PRINT_SIZES.map((s) => (
              <li key={s.id} role="none">
                <button type="button" role="menuitem" onClick={() => { setOpen(false); setJob(s.id); }} className="block w-full px-3 py-2 text-left hover:bg-[#f7f7f7]">
                  <span className="block text-[13px] font-medium text-[#303030]">{s.label}</span>
                  <span className="block text-xs text-[#616161]">{s.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {size
        ? createPortal(
            <div id="print-root">
              <style>{css(size)}</style>
              {size.id === "a4" ? <Slip o={order} from={from} /> : <Label o={order} from={from} compact={size.id === "4x3"} />}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
