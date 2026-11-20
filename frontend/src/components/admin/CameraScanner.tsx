import { LOCALE } from "@/config/brand";
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Btn, money } from "@/components/admin/ui";

/** The browser's own barcode reader (Chrome, Edge and Samsung Internet on Android and desktop). Not in every TypeScript lib yet. */
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;
const detectorCtor = (): DetectorCtor | null => (typeof window !== "undefined" ? ((window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null) : null);

/** True when this browser can read barcodes from the camera. */
export const cameraScanSupported = () => detectorCtor() !== null && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

export type ScanItem = { productId: string; variantId: string | null; name: string; variant: string | null; sku: string | null; price: number; stock: number | null; image: string | null; unitCode?: string | null };
export type ScanUnit = { code: string; status: string; soldAt: string | null; orderNumber: number | null };
/** What the server says about a scanned code. */
export type ScanResult = { items: ScanItem[]; unit?: ScanUnit; needsPiece?: boolean; name?: string };

export const soldOn = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" }) : null);

/** A short beep so a successful scan can be heard as well as seen. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1100;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    /* no sound is fine */
  }
}

type Phase = "scanning" | "checking" | "confirm" | "choose" | "missing" | "sold" | "piece";

/**
 * Full-screen camera scanner for the shop's Quick sell on a phone. When a barcode is read the picture freezes and a
 * confirmation card shows the product name, SKU and price. Nothing is added until the person presses Add to sale; then
 * the scanner closes. "Scan again" goes back to the camera.
 */
export function CameraScanner({ resolve, onConfirm, onClose }: { resolve: (code: string) => Promise<ScanResult>; onConfirm: (item: ScanItem) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const paused = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [code, setCode] = useState("");
  const [items, setItems] = useState<ScanItem[]>([]);
  const [unit, setUnit] = useState<ScanUnit | null>(null);
  const [pieceName, setPieceName] = useState("");
  const resolver = useRef(resolve);
  resolver.current = resolve;

  async function found(read: string) {
    paused.current = true;
    video.current?.pause();
    navigator.vibrate?.(80);
    beep();
    setCode(read);
    setPhase("checking");
    try {
      const r = await resolver.current(read);
      setItems(r.items);
      setUnit(r.unit ?? null);
      setPieceName(r.name ?? "");
      if (r.unit && r.unit.status !== "in_stock") navigator.vibrate?.([200, 100, 200]);
      setPhase(r.unit && r.unit.status !== "in_stock" ? "sold" : r.needsPiece ? "piece" : r.items.length === 0 ? "missing" : r.items.length === 1 ? "confirm" : "choose");
    } catch {
      setItems([]);
      setUnit(null);
      setPhase("missing");
    }
  }

  function again() {
    setItems([]);
    setUnit(null);
    setCode("");
    setPhase("scanning");
    paused.current = false;
    void video.current?.play();
  }

  useEffect(() => {
    const Detector = detectorCtor();
    if (!Detector) {
      setError("This browser cannot scan with the camera. Use Chrome on Android, or type the code instead.");
      return;
    }
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const el = video.current!;
        el.srcObject = stream;
        await el.play();
        const detector = new Detector({ formats: ["code_128"] });
        const tick = async () => {
          if (stopped) return;
          if (!paused.current && el.readyState >= 2) {
            try {
              const read = (await detector.detect(el))[0]?.rawValue?.trim();
              if (read && !paused.current) void found(read);
            } catch {
              /* a frame that cannot be read is simply skipped */
            }
          }
          timer = window.setTimeout(tick, 160);
        };
        void tick();
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setError(denied ? "The camera is blocked. Allow camera access for this site in the browser settings, then try again." : "Could not start the camera.");
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const one = items[0];
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Scan a barcode with the camera">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-[13px] font-semibold">{phase === "scanning" ? "Point the camera at a barcode" : phase === "checking" ? "Barcode read…" : phase === "sold" ? "Already sold" : "Barcode scanned"}</p>
        <button type="button" onClick={onClose} aria-label="Close the scanner" className="grid size-10 place-items-center rounded-full bg-white/15"><X className="size-5" /></button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="size-full object-cover" />
        {!error && phase === "scanning" ? <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" /> : null}
        {!error && phase !== "scanning" ? <div className="pointer-events-none absolute inset-0 bg-black/55" /> : null}
        {error ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            <div><p className="text-[14px]">{error}</p><Btn className="mt-4" onClick={onClose}>Close</Btn></div>
          </div>
        ) : null}
      </div>

      {/* The answer to a scan is a large card, never a small pop-up. */}
      {phase === "scanning" ? (
        <p className="px-4 py-4 text-center text-[13px] text-white">Hold the barcode inside the frame. It will stop and ask you to confirm.</p>
      ) : phase === "checking" ? (
        <p className="px-4 py-6 text-center text-[15px] font-semibold text-white">Finding {code}…</p>
      ) : (
        <div className="rounded-t-2xl bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.35)]">
          {phase === "confirm" && one ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0c5132]"><Check className="size-4" /> Scanned</p>
              <div className="mt-2 flex items-start gap-3">
                <span className="size-16 shrink-0 overflow-hidden rounded-lg bg-[#ebebeb]">{one.image ? <img src={one.image} alt="" className="size-full object-cover" /> : null}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold leading-snug">{one.name}</p>
                  {one.variant ? <p className="text-[13px] text-[#616161]">{one.variant}</p> : null}
                  <p className="mt-1 text-[13px] text-[#616161]">{one.unitCode ? "Piece" : "SKU"} <b className="text-[#303030]">{one.unitCode ?? one.sku ?? code}</b></p>
                </div>
                <p className="text-[22px] font-semibold tabular-nums">{money(one.price)}</p>
              </div>
              {one.stock !== null && one.stock <= 0 ? <p className="mt-2 text-[13px] font-medium text-[#8e1f0b]">This piece is sold out.</p> : one.stock !== null ? <p className="mt-2 text-xs text-[#616161]">{one.stock} in stock</p> : null}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Btn className="!h-12 justify-center" onClick={again}>Scan again</Btn>
                <Btn variant="primary" className="!h-12 justify-center" disabled={one.stock !== null && one.stock <= 0} onClick={() => onConfirm(one)}>Add to sale</Btn>
              </div>
            </>
          ) : phase === "sold" && unit ? (
            <>
              <p className="text-[20px] font-bold text-[#8e1f0b]">ALREADY SOLD</p>
              <p className="mt-2 text-[15px] font-semibold">{items[0]?.name}{items[0]?.variant ? ` · ${items[0].variant}` : ""}</p>
              <p className="mt-1 text-[13px] text-[#616161]">Piece <b className="text-[#303030]">{unit.code}</b> was sold{soldOn(unit.soldAt) ? ` on ${soldOn(unit.soldAt)}` : ""}{unit.orderNumber ? ` (order #${unit.orderNumber})` : ""}. It cannot be sold again.</p>
              <Btn variant="primary" className="mt-4 !h-12 w-full justify-center" onClick={again}>Scan another</Btn>
            </>
          ) : phase === "piece" ? (
            <>
              <p className="text-[17px] font-semibold text-[#8e1f0b]">Scan the barcode on the piece itself</p>
              <p className="mt-1 text-[13px] text-[#616161]">{pieceName || "This design"} has a separate barcode on every piece, so the design code {code} cannot be sold. Scan the label on the piece.</p>
              <Btn variant="primary" className="mt-4 !h-12 w-full justify-center" onClick={again}>Scan again</Btn>
            </>
          ) : phase === "choose" ? (
            <>
              <p className="text-[13px] font-semibold">Scanned {code}. Which one is it?</p>
              <ul className="mt-2 max-h-[45vh] divide-y divide-[#ebebeb] overflow-y-auto">
                {items.map((c) => (
                  <li key={`${c.productId}:${c.variantId ?? ""}`}>
                    <button type="button" onClick={() => onConfirm(c)} className="flex w-full items-center gap-3 py-3 text-left" disabled={c.stock !== null && c.stock <= 0}>
                      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{c.name}{c.variant ? ` · ${c.variant}` : ""}</span><span className="block text-xs text-[#616161]">SKU {c.sku ?? "—"} · {c.stock === null ? "stock not tracked" : c.stock <= 0 ? "sold out" : `${c.stock} in stock`}</span></span>
                      <span className="text-[15px] font-semibold tabular-nums">{money(c.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Btn className="mt-3 !h-12 w-full justify-center" onClick={again}>Scan again</Btn>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-[#8e1f0b]">No piece found for {code}</p>
              <p className="mt-1 text-[13px] text-[#616161]">Check that the label belongs to this shop, then try again.</p>
              <Btn variant="primary" className="mt-4 !h-12 w-full justify-center" onClick={again}>Scan again</Btn>
            </>
          )}
        </div>
      )}
    </div>
  );
}
