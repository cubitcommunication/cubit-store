import { brand } from "@/config/brand";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Btn, Card, Field, adminInput } from "@/components/admin/ui";
import { Switch } from "@/components/ui/switch";
import { Monitor, Smartphone } from "lucide-react";
import { APPEARANCE_DEFAULTS, APPEARANCE_KEYS, CARD_STYLES, MOBILE_CARD_STYLES, appearanceFromSettings, type Appearance, type CardStyle, type MobileCardStyle } from "@/lib/appearance";
import { flagsFromSettings } from "@/lib/commerce";
import { db } from "@/lib/data";
import { siteSettingsQuery } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/appearance")({
  head: () => ({ meta: [{ title: `Product cards — ${brand.name} Admin` }] }),
  component: AppearancePage,
});

const LABELS: Record<string, { label: string; help: string; sort: number }> = {
  ui_card_style: { label: "Product card design", help: "classic | overlay | minimal | elegant | quick", sort: 10 },
  ui_card_mobile_style: { label: "Product card design on phones", help: "same | bag | bar | float | price", sort: 15 },
  ui_card_ratio: { label: "Image shape", help: "4/5 (portrait) | 1/1 (square) | 3/4", sort: 20 },
  ui_grid_columns: { label: "Products per row (desktop)", help: "3 | 4 | 5", sort: 30 },
  ui_card_hover_image: { label: "Show the second photo on hover", help: "1 = yes, 0 = no", sort: 40 },
  ui_card_show_cart: { label: 'Show "Add to cart" on cards', help: "1 = yes, 0 = no (only when the cart is on)", sort: 50 },
  ui_card_show_enquiry: { label: "Show WhatsApp enquiry on cards", help: "1 = yes, 0 = no", sort: 60 },
  ui_card_show_wishlist: { label: "Show the wishlist heart on cards", help: "1 = yes, 0 = no (only when the wishlist is on)", sort: 70 },
  ui_card_show_quickview: { label: 'Show "Quick view" on cards', help: "1 = yes, 0 = no", sort: 80 },
  ui_card_show_variants: { label: "Show variant options on cards", help: "1 = yes, 0 = no", sort: 90 },
  ui_card_show_material: { label: "Show material and category label", help: "1 = yes, 0 = no", sort: 100 },
};

const toRows = (a: Appearance) => [
  [APPEARANCE_KEYS.style, a.style], [APPEARANCE_KEYS.mobileStyle, a.mobileStyle], [APPEARANCE_KEYS.ratio, a.ratio], [APPEARANCE_KEYS.columns, String(a.columns)],
  [APPEARANCE_KEYS.hoverImage, a.hoverImage ? "1" : "0"], [APPEARANCE_KEYS.showCart, a.showCart ? "1" : "0"],
  [APPEARANCE_KEYS.showEnquiry, a.showEnquiry ? "1" : "0"], [APPEARANCE_KEYS.showWishlist, a.showWishlist ? "1" : "0"],
  [APPEARANCE_KEYS.showQuickView, a.showQuickView ? "1" : "0"], [APPEARANCE_KEYS.showVariants, a.showVariants ? "1" : "0"],
  [APPEARANCE_KEYS.showMaterial, a.showMaterial ? "1" : "0"],
] as const;

const same = (a: Appearance, b: Appearance) => JSON.stringify(a) === JSON.stringify(b);

/** Tiny wireframe so each design is recognisable at a glance. */
function Thumb({ id }: { id: CardStyle }) {
  const line = "h-1 rounded-full bg-[#c9c9c9]";
  const img = "rounded-md bg-[#d9d9d9]";
  return (
    <div className="flex h-[104px] w-[76px] flex-col" aria-hidden="true">
      {id === "classic" ? (
        <div className="flex size-full flex-col overflow-hidden rounded-lg border border-[#c9c9c9]"><div className="h-[52px] bg-[#d9d9d9]" /><div className="space-y-1 p-1.5"><div className={cn(line, "w-10")} /><div className={cn(line, "w-6")} /><div className="mt-1 h-3 rounded-md border border-[#8a8a8a]" /></div></div>
      ) : id === "overlay" ? (
        <div className="space-y-1.5"><div className={cn(img, "relative h-[66px]")}><span className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1"><i className="size-2.5 rounded-full bg-white" /><i className="size-2.5 rounded-full bg-white" /><i className="size-2.5 rounded-full bg-white" /></span></div><div className={cn(line, "w-10")} /><div className={cn(line, "w-6")} /></div>
      ) : id === "minimal" ? (
        <div className="space-y-1.5"><div className={cn(img, "relative h-[66px]")}><span className="absolute inset-x-2 bottom-1.5 h-2.5 rounded-full bg-white" /></div><div className={cn(line, "mx-auto w-10")} /><div className={cn(line, "mx-auto w-6")} /></div>
      ) : id === "elegant" ? (
        <div className="relative h-[92px] overflow-hidden rounded-lg bg-[#9a9a9a]"><div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-6"><div className="h-1 w-10 rounded-full bg-white/90" /><div className="h-1 w-6 rounded-full bg-white/70" /><div className="h-2.5 rounded-full bg-white" /></div></div>
      ) : (
        <div className="flex size-full flex-col overflow-hidden rounded-lg border border-[#c9c9c9]"><div className="h-[44px] bg-[#d9d9d9]" /><div className="space-y-1 p-1.5"><div className={cn(line, "w-10")} /><div className="flex gap-1"><i className="size-2 rounded-full bg-[#8a8a8a]" /><i className="size-2 rounded-full bg-[#c9c9c9]" /><i className="size-2 rounded-full bg-[#c9c9c9]" /></div><div className="h-3.5 rounded-md bg-[#303030]" /></div></div>
      )}
    </div>
  );
}

/** Wireframes of the four phone designs. */
function PhoneThumb({ id }: { id: MobileCardStyle }) {
  const line = "h-1 rounded-full bg-[#c9c9c9]";
  const photo = "relative h-[62px] rounded-md bg-[#d9d9d9]";
  return (
    <div className="flex h-[104px] w-[76px] flex-col justify-start gap-1.5" aria-hidden="true">
      {id === "same" ? (
        <div className="flex size-full items-center justify-center rounded-lg border border-dashed border-[#c9c9c9] text-[#8a8a8a]"><Monitor className="size-6" /></div>
      ) : (
        <>
          <div className={photo}>
            <i className="absolute right-1 top-1 size-2.5 rounded-full bg-white" />
            {id === "float" ? <i className="absolute bottom-1 right-1 size-4 rounded-full bg-white shadow" /> : null}
          </div>
          <div className={cn(line, "w-12")} />
          {id === "bag" ? <div className="flex items-center justify-between"><div className={cn(line, "w-7")} /><i className="size-4 rounded-full bg-[#303030]" /></div> : null}
          {id === "bar" ? <><div className={cn(line, "w-7")} /><div className="h-3.5 rounded-md bg-[#303030]" /></> : null}
          {id === "float" ? <div className={cn(line, "w-7")} /> : null}
          {id === "price" ? <div className="mt-0.5 flex h-4 items-center justify-center rounded-full bg-[#303030]"><span className="h-1 w-9 rounded-full bg-white/80" /></div> : null}
        </>
      )}
    </div>
  );
}

function AppearancePage() {
  const qc = useQueryClient();
  const router = useRouter();
  const settings = useQuery({ ...siteSettingsQuery(), staleTime: 0 });
  const flags = flagsFromSettings(settings.data);
  const [draft, setDraft] = useState<Appearance>(APPEARANCE_DEFAULTS);
  const [saved, setSaved] = useState<Appearance>(APPEARANCE_DEFAULTS);
  const [page, setPage] = useState("/shop");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    const current = appearanceFromSettings(settings.data);
    setDraft(current);
    setSaved(current);
  }, [settings.data]);

  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "shop-ui-preview", appearance: draft, demo: true }, window.location.origin);
  }, [draft]);

  // The preview frame announces when it is ready; after that every change is pushed to it instantly.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "shop-ui-preview-ready") {
        setReady(true);
        send();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);
  useEffect(() => {
    if (ready) send();
  }, [ready, send]);

  const dirty = !same(draft, saved);
  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const rows = toRows(draft).map(([key, value]) => ({
        key, value, group_name: "appearance", label: LABELS[key]!.label, help: LABELS[key]!.help, multiline: false, sort_order: LABELS[key]!.sort,
      }));
      const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setSaved(draft);
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      await router.invalidate();
      toast.success("Product cards saved. The live site is updated.");
    },
    onError: () => toast.error("Could not save. Please try again."),
  });

  const toggles: { key: keyof Appearance; label: string; help: string; note?: string | false }[] = [
    { key: "showCart", label: '"Add to cart" button', help: "Add straight from the card. Products with options say “Choose options”.", note: !flags.cart && "Cart is off in Store features" },
    { key: "showWishlist", label: "Wishlist heart", help: "Heart icon on the photo.", note: !flags.wishlist && "Wishlist is off in Store features" },
    { key: "showQuickView", label: "Quick view", help: "Eye icon that opens a pop-up with options and add to cart." },
    { key: "showVariants", label: "Variant options on the card", help: "Size or colour chips (only for products that have options)." },
    { key: "hoverImage", label: "Second photo on hover", help: "Shows the next photo when the pointer moves over a card." },
    { key: "showMaterial", label: "Material and category label", help: "Small label above the product name." },
  ];

  return (
    <AdminShell
      title="Product cards"
      actions={
        <>
          <Btn disabled={!dirty || save.isPending} onClick={() => setDraft(saved)}>Discard</Btn>
          <Btn variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Btn>
        </>
      }
    >
      <p className="-mt-2 mb-4 text-[13px] text-[#616161]">
        Choose how products look everywhere they appear: home page, shop, collections and related products. The preview on the right is the real shop; nothing goes live until you press Save.
      </p>

      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Card design">
            <div role="radiogroup" aria-label="Card design" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
              {CARD_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.style === s.id}
                  onClick={() => set("style", s.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-[10px] border bg-white p-3 text-center transition-colors",
                    draft.style === s.id ? "border-[#303030] ring-2 ring-[#303030]/20" : "border-[#e3e3e3] hover:border-[#8a8a8a]",
                  )}
                >
                  <Thumb id={s.id} />
                  <span className="text-[13px] font-semibold">{s.label}</span>
                  <span className="text-[11px] leading-snug text-[#616161]">{s.description}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Card design on phones">
            <p className="mb-3 text-xs text-[#616161]">Used on screens under 640px wide. Tablets and computers keep the design above. Switch the preview to “Phone” to see it.</p>
            <div role="radiogroup" aria-label="Phone card design" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
              {MOBILE_CARD_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.mobileStyle === s.id}
                  onClick={() => { set("mobileStyle", s.id); setDevice("phone"); }}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-[10px] border bg-white p-3 text-center transition-colors",
                    draft.mobileStyle === s.id ? "border-[#303030] ring-2 ring-[#303030]/20" : "border-[#e3e3e3] hover:border-[#8a8a8a]",
                  )}
                >
                  <PhoneThumb id={s.id} />
                  <span className="text-[13px] font-semibold">{s.label}</span>
                  <span className="text-[11px] leading-snug text-[#616161]">{s.description}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card title="What the card shows">
            <ul className="divide-y divide-[#ebebeb]">
              {toggles.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">{t.label}</p>
                    <p className="text-xs text-[#616161]">{t.help}</p>
                    {t.note ? <p className="mt-1"><Badge tone="attention">{t.note}</Badge></p> : null}
                  </div>
                  <Switch checked={Boolean(draft[t.key])} onCheckedChange={(v) => set(t.key, v as never)} aria-label={t.label} />
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Layout">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Image shape">
                <select value={draft.ratio} onChange={(e) => set("ratio", e.target.value as Appearance["ratio"])} className={adminInput}>
                  <option value="4/5">Portrait (4:5)</option>
                  <option value="3/4">Tall portrait (3:4)</option>
                  <option value="1/1">Square (1:1)</option>
                </select>
              </Field>
              <Field label="Products per row (desktop)">
                <select value={draft.columns} onChange={(e) => set("columns", Number(e.target.value) as Appearance["columns"])} className={adminInput}>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </Field>
            </div>
          </Card>
        </div>

        <Card
          title="Live preview"
          actions={
            <div className="flex items-center gap-2">
              <div role="group" aria-label="Preview size" className="inline-flex overflow-hidden rounded-lg border border-[#c9c9c9]">
                {([["desktop", Monitor, "Desktop"], ["phone", Smartphone, "Phone"]] as const).map(([id, Icon, label]) => (
                  <button key={id} type="button" aria-pressed={device === id} onClick={() => { setReady(false); setDevice(id); }} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium", device === id ? "bg-[#303030] text-white" : "bg-white text-[#303030] hover:bg-[#f7f7f7]")}>
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
            <select value={page} onChange={(e) => { setReady(false); setPage(e.target.value); }} aria-label="Preview page" className={cn(adminInput, "!w-auto")}>
              <option value="/shop">Shop page</option>
              <option value="/">Home page</option>
              <option value="/collections">Collections page</option>
            </select>
            </div>
          }
          className="xl:sticky xl:top-[122px] xl:self-start"
        >
          <p className="mb-2 text-xs text-[#616161]">The first two products show demo size and colour options so you can see how variants look. Hover a card to see its actions.</p>
          <iframe
            ref={frame}
            key={`${page}-${device}`}
            title="Storefront preview"
            src={page}
            onLoad={() => setReady(true)}
            className={cn("mx-auto h-[calc(100vh-230px)] min-h-[560px] rounded-[10px] border border-[#e3e3e3] bg-white", device === "phone" ? "w-[390px] max-w-full" : "w-full")}
          />
        </Card>
      </div>
    </AdminShell>
  );
}
