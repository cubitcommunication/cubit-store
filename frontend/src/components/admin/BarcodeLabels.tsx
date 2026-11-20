import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Btn, Card, adminInput, money } from "@/components/admin/ui";
import { LoadingRows } from "@/components/ui/loading-rows";
import { api, ApiError } from "@/lib/api";
import { canEncode, code128Bars } from "@/lib/code128";
import { cn } from "@/lib/utils";

type Row = { productId: string; variantId: string | null; name: string; variant: string | null; sku: string | null; price: number; stock: number | null; pieces?: { total: number; inStock: number } };
type Data = { rows: Row[] };
type Label = { key: string; code: string; name: string; variant: string | null; price: number };
const keyOf = (r: Row) => `${r.productId}:${r.variantId ?? ""}`;

const SIZES = [
  { id: "50x25", label: "50 × 25 mm label", w: 50, h: 25 },
  { id: "38x25", label: "38 × 25 mm label", w: 38, h: 25 },
  { id: "70x35", label: "70 × 35 mm label", w: 70, h: 35 },
] as const;

/** The barcode: Code 128 of the SKU, drawn as an SVG so it prints sharp at any size. */
export function Barcode({ value, height = 28 }: { value: string; height?: number }) {
  const { bars, width } = useMemo(() => code128Bars(value), [value]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Barcode ${value}`} className="block w-full" style={{ height: `${height / 3}mm` }} shapeRendering="crispEdges">
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />)}
    </svg>
  );
}

type Mode = "design" | "piece";

/**
 * Two kinds of labels. "Design" prints the SKU, the same barcode on every piece of a design. "Piece" gives every physical
 * piece its own code (ER-0001.01, ER-0001.02...), so scanning a piece that was already sold warns "already sold".
 */
export function BarcodeLabels() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("design");
  const [term, setTerm] = useState("");
  const [size, setSize] = useState<(typeof SIZES)[number]["id"]>("50x25");
  const [showPrice, setShowPrice] = useState(true);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const [queue, setQueue] = useState<Label[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin", "inventory", "all", term, "labels"], queryFn: () => api<Data>(`/admin/inventory?filter=all&q=${encodeURIComponent(term.trim())}`), placeholderData: (p) => p });

  const rows = list.data?.rows ?? [];
  const ok = (r: Row) => Boolean(r.sku) && canEncode(r.sku!);
  const setCopy = (r: Row, n: number) => setCopies((c) => ({ ...c, [keyOf(r)]: Math.max(0, Math.min(200, n)) }));
  const dim = SIZES.find((s) => s.id === size)!;

  const designLabels: Label[] = rows.filter((r) => (copies[keyOf(r)] ?? 0) > 0 && ok(r)).flatMap((r) =>
    Array.from({ length: copies[keyOf(r)] ?? 0 }, (_, n) => ({ key: `${keyOf(r)}-${n}`, code: r.sku!, name: r.name, variant: r.variant, price: r.price })));
  const labels = mode === "design" ? designLabels : queue;
  const total = labels.length;

  /** How many new codes to suggest: the pieces in stock that have none yet (or the whole stock the first time). */
  const suggested = (r: Row) => {
    const have = r.pieces?.inStock ?? 0;
    const missing = r.stock !== null ? Math.max(0, r.stock - have) : 0;
    return missing || ((r.pieces?.total ?? 0) === 0 ? Math.max(1, r.stock ?? 1) : 0);
  };

  async function makePieces(r: Row) {
    const count = fresh[keyOf(r)] ?? suggested(r);
    if (count < 1) return;
    setBusy(keyOf(r));
    try {
      const res = await api<{ codes: string[] }>("/admin/units/create", { method: "POST", body: { product_id: r.productId, variant_id: r.variantId, count } });
      setQueue((q) => [...q, ...res.codes.map((code) => ({ key: code, code, name: r.name, variant: r.variant, price: r.price }))]);
      setFresh((f) => ({ ...f, [keyOf(r)]: 0 }));
      void qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
      toast.success(`Made ${res.codes.length} piece barcode${res.codes.length === 1 ? "" : "s"} (${res.codes[0]}${res.codes.length > 1 ? ` to ${res.codes[res.codes.length - 1]}` : ""}). They are ready to print.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not make the barcodes.");
    } finally {
      setBusy(null);
    }
  }

  async function reprint(r: Row) {
    setBusy(keyOf(r));
    try {
      const res = await api<{ codes: string[] }>(`/admin/units/in-stock?product_id=${r.productId}${r.variantId ? `&variant_id=${r.variantId}` : ""}`);
      if (!res.codes.length) return void toast.error("No pieces in stock have a barcode yet.");
      setQueue((q) => [...q.filter((x) => !res.codes.includes(x.code)), ...res.codes.map((code) => ({ key: code, code, name: r.name, variant: r.variant, price: r.price }))]);
      toast.success(`Added ${res.codes.length} existing barcode${res.codes.length === 1 ? "" : "s"} to the print list.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load the barcodes.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Barcode type" className="inline-flex overflow-hidden rounded-lg border border-[#c9c9c9] bg-white">
        {([["design", "Design barcode (SKU)"], ["piece", "Piece barcodes (one per piece)"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={cn("px-4 py-1.5 text-[13px] font-medium", mode === id ? "bg-[#303030] text-white" : "hover:bg-[#f7f7f7]")}>{label}</button>
        ))}
      </div>
      <p className="max-w-3xl text-[13px] text-[#616161]">
        {mode === "design"
          ? "Every piece of a design gets the same barcode, its SKU. Quick sell counts the stock down, but it cannot know which individual piece was sold."
          : "Every physical piece gets its own barcode, like ER-0001.01, ER-0001.02. Scanning a piece that was already sold shows ALREADY SOLD. Once a design has piece barcodes, Quick sell sells it only by scanning the piece, so give every piece in stock a barcode."}
      </p>

      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e3e3] px-3 pb-3">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name or SKU" className={`${adminInput} max-w-xs`} />
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <select value={size} onChange={(e) => setSize(e.target.value as typeof size)} className={adminInput} aria-label="Label size">{SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show price</label>
            {mode === "design" ? <Btn onClick={() => setCopies(Object.fromEntries(rows.filter(ok).map((r) => [keyOf(r), Math.max(1, r.stock ?? 1)])))}>One per piece in stock</Btn> : null}
            <Btn onClick={() => (mode === "design" ? setCopies({}) : setQueue([]))} disabled={!total}>Clear list</Btn>
            <Btn variant="primary" onClick={() => window.print()} disabled={!total}><Printer className="size-3.5" /> Print {total || ""} label{total === 1 ? "" : "s"}</Btn>
          </div>
        </div>
        {list.isPending ? <LoadingRows rows={5} /> : rows.length === 0 ? <p className="px-6 py-12 text-center text-[13px] text-[#616161]">Nothing matches.</p> : (
          <ul className="divide-y divide-[#ebebeb]">
            {rows.map((r) => {
              const pieces = r.pieces ?? { total: 0, inStock: 0 };
              const missing = r.stock !== null ? Math.max(0, r.stock - pieces.inStock) : 0;
              return (
                <li key={keyOf(r)} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 basis-56 text-[13px]">
                    <span className="block truncate font-medium">{r.name}{r.variant ? <span className="font-normal text-[#616161]"> · {r.variant}</span> : null}</span>
                    <span className="block text-xs text-[#616161]">
                      {ok(r) ? `SKU ${r.sku}` : r.sku ? "SKU has characters a barcode cannot hold" : "No SKU: add one first (Stock tab → Generate missing SKUs)"} · {money(r.price)}
                      {mode === "piece" ? ` · ${r.stock === null ? "stock not tracked" : `${r.stock} in stock`} · ${pieces.inStock} with a barcode` : ""}
                    </span>
                    {mode === "piece" && pieces.total > 0 && missing > 0 ? <span className="block text-xs font-medium text-[#8a6116]">{missing} in stock {missing === 1 ? "has" : "have"} no barcode yet, so {missing === 1 ? "it" : "they"} cannot be sold in the shop.</span> : null}
                  </span>
                  {mode === "design" ? (
                    <label className="flex items-center gap-2 text-xs text-[#616161]">Labels
                      <input type="number" min={0} max={200} disabled={!ok(r)} value={copies[keyOf(r)] ?? 0} onChange={(e) => setCopy(r, Number(e.target.value) || 0)} className={`${adminInput} !w-20`} />
                    </label>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#616161]">
                      <label className="flex items-center gap-2">New
                        <input type="number" min={0} max={200} disabled={!ok(r)} value={fresh[keyOf(r)] ?? suggested(r)} onChange={(e) => setFresh((f) => ({ ...f, [keyOf(r)]: Math.max(0, Math.min(200, Number(e.target.value) || 0)) }))} className={`${adminInput} !w-20`} />
                      </label>
                      <Btn disabled={!ok(r) || busy === keyOf(r)} onClick={() => void makePieces(r)}>Make &amp; add</Btn>
                      {pieces.inStock > 0 ? <Btn disabled={busy === keyOf(r)} onClick={() => void reprint(r)}>Reprint {pieces.inStock}</Btn> : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-xs text-[#616161]">Barcodes are Code 128, so any USB barcode scanner reads them. Choose the label size that matches your stickers or tags, print, and test one by scanning it in Quick sell.</p>

      {/* What is printed: only this block is visible when printing (see .label-sheet in styles.css). */}
      <div className="label-sheet" aria-hidden="true">
        {labels.map((l) => (
          <div key={l.key} className="label-item" style={{ width: `${dim.w}mm`, height: `${dim.h}mm` }}>
            <p className="label-name">{l.name}{l.variant ? ` · ${l.variant}` : ""}</p>
            <Barcode value={l.code} height={30} />
            <p className="label-foot"><span>{l.code}</span>{showPrice ? <b>{money(l.price)}</b> : null}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
