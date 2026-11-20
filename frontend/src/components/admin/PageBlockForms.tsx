import { brand } from "@/config/brand";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { LinkPicker } from "@/components/admin/LinkPicker";
import { Btn, Field, IconBtn, adminInput } from "@/components/admin/ui";
import { categoriesQuery, collectionsQuery, productsQuery } from "@/lib/catalog";
import { BLOCK_LABELS, parseVideo, withLayout, type Block, type BlockStyle, type ColumnsBlock, type ColumnsLayout, type Device, type ProductsBlock } from "@/lib/pages";
import { uploadSiteImage } from "@/lib/storage";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { SECTION_FIELDS, isSectionType, seedContent, type SectionField } from "@/lib/section-content";
import { parseTiles, type TileConfig } from "@/lib/category-tiles";
import { parseBands, parseOccasions, type OccasionTab, type StoryBand } from "@/lib/home-content";
import { fetchSiteSettings } from "@/lib/site-settings";
import { fetchSiteMedia, useSiteMedia } from "@/lib/site-media";
import { PremiumBlockForm } from "@/components/admin/PremiumBlockForm";
import { isPremiumType, type PremiumBlock } from "@/lib/premium-blocks";

type Change = (patch: Record<string, unknown>) => void;

/* ------------------------------------------------------------------ tiny field helpers */

export function Text({ label, value, onChange, rows, max = 200, help }: { label: string; value: string; onChange: (v: string) => void; rows?: number; max?: number; help?: string }) {
  return (
    <Field label={label} {...(help ? { help } : {})}>
      {rows ? <textarea className={adminInput} rows={rows} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className={adminInput} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function Choice({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <select className={adminInput} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </Field>
  );
}

export function LinkField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <LinkPicker value={value} onChange={onChange} allowEmpty />
    </Field>
  );
}

export function ImageField({ label, value: raw, onChange }: { label: string; value: string | null | undefined; onChange: (url: string) => void }) {
  const value = raw ?? "";
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // "media:<slot>" points at one of the site's own pictures: show the picture it currently resolves to.
  const slotPicture = useSiteMedia(value.startsWith("media:") ? value.slice(6) : "").src;

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadSiteImage(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <span className="text-[13px] font-medium">{label}</span>
      <div className="mt-1 flex items-center gap-3">
        {value.startsWith("media:") && slotPicture ? (
          <img src={slotPicture} alt="" className="size-16 rounded-lg border border-[#e3e3e3] object-cover" />
        ) : value.startsWith("media:") ? (
          <div className="flex size-16 items-center justify-center rounded-lg border border-[#e3e3e3] bg-[#f7f7f7] p-1 text-center text-[10px] leading-tight text-[#616161]">Site image</div>
        ) : value ? (
          <img src={value} alt="" className="size-16 rounded-lg border border-[#e3e3e3] object-cover" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-[#c9c9c9] text-[#8a8a8a]"><ImagePlus className="size-5" /></div>
        )}
        <div className="flex flex-wrap gap-2">
          <Btn disabled={busy} onClick={() => setChoosing(true)}>{value ? "Change" : "Choose from Media"}</Btn>
          <Btn disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : "Upload"}</Btn>
          {value ? <Btn variant="danger" onClick={() => onChange("")}>Remove</Btn> : null}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {choosing ? <MediaPicker onClose={() => setChoosing(false)} onPick={(urls) => { setChoosing(false); if (urls[0]) onChange(urls[0]); }} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ content tab */

export function BlockForm({ block, onChange }: { block: Block; onChange: Change }) {
  const v = block as unknown as Record<string, unknown>;
  const s = (key: string) => String(v[key] ?? "");
  const t = (label: string, key: string, o?: { rows?: number; max?: number; help?: string }) => <Text label={label} value={s(key)} onChange={(x) => onChange({ [key]: x })} {...o} />;
  const c = (label: string, key: string, options: [string, string][]) => <Choice label={label} value={s(key)} options={options} onChange={(x) => onChange({ [key]: x })} />;
  const l = (label: string, key: string) => <LinkField label={label} value={s(key)} onChange={(x) => onChange({ [key]: x })} />;

  if (isPremiumType(block.type)) return <PremiumBlockForm block={block as unknown as PremiumBlock} onChange={onChange} />;

  switch (block.type) {
    case "hero":
      return (
        <>
          <ImageField label="Background image" value={block.image} onChange={(x) => onChange({ image: x })} />
          {t("Heading", "heading")}
          {t("Text under the heading", "subheading", { rows: 2, max: 400 })}
          {t("Button label", "buttonLabel", { max: 40 })}
          {l("Button opens", "buttonLink")}
          {c("Height", "height", [["medium", "Medium"], ["tall", "Tall"]])}
          {c("Text position", "align", [["left", "Left"], ["center", "Centre"]])}
        </>
      );
    case "text":
      return (
        <>
          {t("Small title above", "eyebrow", { max: 60 })}
          {t("Heading", "heading")}
          {t("Text", "body", { rows: 6, max: 2000 })}
          {c("Alignment", "align", [["center", "Centre"], ["left", "Left"]])}
        </>
      );
    case "image":
      return (
        <>
          <ImageField label="Image" value={block.image} onChange={(x) => onChange({ image: x })} />
          {t("Picture description (for screen readers)", "alt", { max: 160 })}
          {l("When clicked, open", "link")}
          {c("Width", "width", [["contained", "Page width"], ["full", "Edge to edge"]])}
        </>
      );
    case "image_text":
      return (
        <>
          <ImageField label="Image" value={block.image} onChange={(x) => onChange({ image: x })} />
          {t("Picture description (for screen readers)", "alt", { max: 160 })}
          {t("Small title above", "eyebrow", { max: 60 })}
          {t("Heading", "heading")}
          {t("Text", "body", { rows: 5, max: 2000 })}
          {t("Button label", "buttonLabel", { max: 40 })}
          {l("Button opens", "buttonLink")}
          {c("Image position", "imageSide", [["left", "Left"], ["right", "Right"]])}
        </>
      );
    case "products":
      return <ProductsForm block={block} onChange={onChange} />;
    case "cta":
      return (
        <>
          {t("Heading", "heading")}
          {t("Text", "body", { rows: 3, max: 400 })}
          {t("Button label", "buttonLabel", { max: 40 })}
          {l("Button opens", "buttonLink")}
          {c("Colour", "tone", [["dark", "Dark"], ["light", "Light"], ["red", `${brand.name} red`]])}
        </>
      );
    case "button":
      return (
        <>
          {t("Label", "label", { max: 40 })}
          {l("Opens", "link")}
          {c("Style", "variant", [["solid", "Solid"], ["outline", "Outline"]])}
          {c("Position", "align", [["center", "Centre"], ["left", "Left"], ["right", "Right"]])}
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={block.fullWidth} onChange={(e) => onChange({ fullWidth: e.target.checked })} /> Full width</label>
        </>
      );
    case "columns":
      return <ColumnsForm block={block} onChange={onChange} />;
    case "faq":
      return (
        <>
          {t("Heading", "heading", { max: 120 })}
          <ListEditor
            label="Questions"
            items={block.items}
            blank={{ q: "", a: "" }}
            onChange={(items) => onChange({ items })}
            render={(item, set) => (
              <>
                <Text label="Question" value={item.q} max={200} onChange={(x) => set({ q: x })} />
                <Text label="Answer" value={item.a} rows={3} max={1000} onChange={(x) => set({ a: x })} />
              </>
            )}
          />
        </>
      );
    case "features":
      return (
        <>
          {t("Heading", "heading", { max: 120 })}
          <Choice label="Boxes per row" value={String(block.perRow)} options={[["2", "2"], ["3", "3"], ["4", "4"]]} onChange={(x) => onChange({ perRow: Number(x) })} />
          <ListEditor
            label="Boxes"
            items={block.items}
            blank={{ title: "", body: "" }}
            onChange={(items) => onChange({ items })}
            render={(item, set) => (
              <>
                <Text label="Title" value={item.title} max={80} onChange={(x) => set({ title: x })} />
                <Text label="Text" value={item.body} rows={2} max={300} onChange={(x) => set({ body: x })} />
              </>
            )}
          />
        </>
      );
    case "video": {
      const ok = (block.url ?? "").trim() === "" || parseVideo(block.url ?? "") !== null;
      return (
        <>
          <Text label="Video link" value={block.url} max={300} onChange={(x) => onChange({ url: x })} help={ok ? "A YouTube or Vimeo link, or an https .mp4 file." : "This link is not a YouTube, Vimeo or .mp4 (https) address."} />
          {t("Caption (optional)", "caption", { max: 160 })}
        </>
      );
    }
    case "team":
      return (
        <>
          {t("Small title above", "eyebrow", { max: 60 })}
          {t("Heading", "heading", { max: 120 })}
          <ListEditor
            label="People"
            items={block.items}
            blank={{ name: "", role: "", image: "", blurb: "", link: "" }}
            onChange={(items) => onChange({ items })}
            render={(item, set) => (
              <>
                <ImageField label="Photo" value={item.image} onChange={(x) => set({ image: x })} />
                <Text label="Name" value={item.name} max={80} onChange={(x) => set({ name: x })} />
                <Text label="Role" value={item.role} max={80} onChange={(x) => set({ role: x })} />
                <Text label="Short text" value={item.blurb} rows={2} max={300} onChange={(x) => set({ blurb: x })} />
                <Text label="Instagram or website link" value={item.link} max={300} onChange={(x) => set({ link: x })} />
              </>
            )}
          />
        </>
      );
    case "spacer":
      return (
        <>
          <Field label={`Height: ${block.height}px`}>
            <input type="range" min={8} max={200} step={8} value={block.height} onChange={(e) => onChange({ height: Number(e.target.value) })} className="w-full accent-[#303030]" />
          </Field>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={block.divider} onChange={(e) => onChange({ divider: e.target.checked })} /> Show a thin line</label>
        </>
      );
    default:
      if (isSectionType(block.type)) return <SectionForm type={block.type} content={(block as { content?: Record<string, string> }).content ?? {}} onChange={(content) => onChange({ content })} />;
      return (
        <p className="text-[13px] leading-relaxed text-[#616161]">
          {BLOCK_LABELS[block.type].help}. This block fills itself in from the product or collection being shown, so there is nothing to type here. You can move, hide or remove it, or change its Style.
        </p>
      );
  }
}

/** The text and pictures of a site section, saved inside the page. */
function SectionForm({ type, content, onChange }: { type: keyof typeof SECTION_FIELDS; content: Record<string, string>; onChange: (c: Record<string, string>) => void }) {
  const set = (patch: Record<string, string>) => onChange({ ...content, ...patch });
  const collections = useQuery(collectionsQuery());
  const categories = useQuery(categoriesQuery());
  const val = (k: string) => content[k] ?? "";
  return (
    <>
      {SECTION_FIELDS[type].map((f: SectionField) => {
        switch (f.kind) {
          case "text":
            return <Text key={f.key} label={f.label} value={val(f.key)} max={f.max ?? 200} onChange={(x) => set({ [f.key]: x })} />;
          case "long":
            return <Text key={f.key} label={f.label} value={val(f.key)} rows={3} max={f.max ?? 400} onChange={(x) => set({ [f.key]: x })} />;
          case "link":
            return <LinkField key={f.key} label={f.label} value={val(f.key)} onChange={(x) => set({ [f.key]: x })} />;
          case "toggle":
            return (
              <label key={f.key} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={val(f.key) !== "0"} onChange={(e) => set({ [f.key]: e.target.checked ? "1" : "0" })} /> {f.label}
              </label>
            );
          case "choice":
            return <Choice key={f.key} label={f.label} value={val(f.key) || f.default || ""} options={f.options} onChange={(x) => set({ [f.key]: x })} />;
          case "image":
            return (
              <div key={f.key} className="space-y-2">
                <ImageField label={f.label} value={val(`img:${f.key}`)} onChange={(x) => set({ [`img:${f.key}`]: x })} />
                {f.mobile ? <ImageField label="Picture on phones (optional)" value={val(`imgm:${f.key}`)} onChange={(x) => set({ [`imgm:${f.key}`]: x })} /> : null}
              </div>
            );
          case "bands": {
            const bands = parseBands(val(f.key));
            return (
              <ListEditor<StoryBand>
                key={f.key}
                label={f.label}
                items={bands}
                blank={{ eyebrow: "", title: "New story", body: "", cta: "", url: "", media: "", visible: true }}
                onChange={(items) => set({ [f.key]: JSON.stringify(items) })}
                render={(item, put) => (
                  <>
                    <ImageField label="Picture" value={item.media} onChange={(x) => put({ media: x })} />
                    <Text label="Small title above" value={item.eyebrow} max={60} onChange={(x) => put({ eyebrow: x })} />
                    <Text label="Heading" value={item.title} max={120} onChange={(x) => put({ title: x })} />
                    <Text label="Text" value={item.body} rows={3} max={400} onChange={(x) => put({ body: x })} />
                    <Text label="Button label" value={item.cta} max={60} onChange={(x) => put({ cta: x })} />
                    <LinkField label="Button opens" value={item.url} onChange={(x) => put({ url: x })} />
                    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={item.visible} onChange={(e) => put({ visible: e.target.checked })} /> Show on the page</label>
                  </>
                )}
              />
            );
          }
          case "tiles": {
            const tiles = parseTiles(val(f.key));
            const options: [string, string][] = [
              ...(categories.data ?? []).map((c): [string, string] => [`category:${c.slug}`, `Category: ${c.name}`]),
              ...(collections.data ?? []).map((c): [string, string] => [`collection:${c.slug}`, `Collection: ${c.name}`]),
            ];
            return (
              <div key={f.key} className="space-y-2">
                <ListEditor<TileConfig>
                  label={f.label}
                  items={tiles}
                  blank={{ kind: "collection", slug: collections.data?.[0]?.slug ?? "" }}
                  onChange={(items) => set({ [f.key]: JSON.stringify(items) })}
                  render={(item, put) => (
                    <>
                      <Choice
                        label="Show"
                        value={`${item.kind}:${item.slug}`}
                        options={[["", "Choose a category or collection"], ...options]}
                        onChange={(x) => {
                          const [kind, ...rest] = x.split(":");
                          if (kind === "category" || kind === "collection") put({ kind, slug: rest.join(":") });
                        }}
                      />
                      <Text label="Name on the tile (optional)" value={item.label ?? ""} max={60} onChange={(x) => put({ label: x })} />
                      <ImageField label="Picture (optional, otherwise its own picture)" value={item.image ?? ""} onChange={(x) => put({ image: x })} />
                    </>
                  )}
                />
                <p className="text-xs text-[#616161]">Add categories and collections in any order. While the list is empty, all your published categories are shown with their own pictures.</p>
              </div>
            );
          }
          case "occasions": {
            const tabs = parseOccasions(val(f.key));
            return (
              <ListEditor<OccasionTab>
                key={f.key}
                label={f.label}
                items={tabs}
                blank={{ label: "New tab", collection: collections.data?.[0]?.slug ?? "" }}
                onChange={(items) => set({ [f.key]: JSON.stringify(items) })}
                render={(item, put) => (
                  <>
                    <Text label="Tab name" value={item.label} max={40} onChange={(x) => put({ label: x })} />
                    <Choice label="Shows products of" value={item.collection} options={[["", "Choose a collection"], ...(collections.data ?? []).map((c): [string, string] => [c.slug, c.name])]} onChange={(x) => put({ collection: x })} />
                  </>
                )}
              />
            );
          }
        }
      })}
      <button
        type="button"
        className="text-[12px] text-[#616161] underline"
        onClick={async () => {
          if (!window.confirm("Replace everything in this section with the current Online store settings?")) return;
          try {
            const [rows, media] = await Promise.all([fetchSiteSettings(), fetchSiteMedia()]);
            onChange(seedContent(type, rows, media));
          } catch {
            toast.error("Could not load the settings.");
          }
        }}
      >
        Reset this section to the old shop settings
      </button>
    </>
  );
}

function ListEditor<T extends object>({ label, items, blank, onChange, render }: { label: string; items: T[]; blank: T; onChange: (items: T[]) => void; render: (item: T, set: (patch: Partial<T>) => void) => ReactNode }) {
  const move = (i: number, by: number) => {
    const next = [...items];
    const to = i + by;
    if (to < 0 || to >= next.length) return;
    [next[i], next[to]] = [next[to]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <span className="text-[13px] font-medium">{label} ({items.length})</span>
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-[#e3e3e3] p-2.5">
          {render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
          <div className="flex justify-end gap-0.5">
            <IconBtn icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
            <IconBtn icon={ArrowDown} label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
            <IconBtn icon={Trash2} label="Remove" tone="danger" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <Btn onClick={() => onChange([...items, { ...blank }])}><Plus className="size-3.5" />Add</Btn>
    </div>
  );
}

const LAYOUTS: [ColumnsLayout, string][] = [["1-1", "2 equal"], ["1-1-1", "3 equal"], ["1-1-1-1", "4 equal"], ["1-2", "1/3 + 2/3"], ["2-1", "2/3 + 1/3"]];

function ColumnsForm({ block, onChange }: { block: ColumnsBlock; onChange: Change }) {
  return (
    <>
      <Choice label="Layout" value={block.layout} options={LAYOUTS} onChange={(x) => onChange(withLayout(block, x as ColumnsLayout) as unknown as Record<string, unknown>)} />
      <Choice label="Space between columns" value={block.gap} options={[["sm", "Small"], ["md", "Medium"], ["lg", "Large"]]} onChange={(x) => onChange({ gap: x })} />
      <Choice label="Vertical alignment" value={block.valign} options={[["top", "Top"], ["center", "Centre"]]} onChange={(x) => onChange({ valign: x })} />
      <p className="text-xs text-[#616161]">Use the “Add to this column” buttons on the canvas, or the Layers tab, to put blocks inside the columns. Columns stack on phones.</p>
    </>
  );
}

function ProductsForm({ block, onChange }: { block: ProductsBlock; onChange: Change }) {
  const products = useQuery(productsQuery());
  const collections = useQuery(collectionsQuery());
  const categories = useQuery(categoriesQuery());
  const [term, setTerm] = useState("");
  const all = products.data ?? [];
  const chosen = useMemo(() => new Set(block.productIds), [block.productIds]);
  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((p) => !chosen.has(p.id) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))).slice(0, 8);
  }, [all, chosen, term]);
  const byId = new Map(all.map((p) => [p.id, p]));

  return (
    <>
      <Text label="Heading above the grid" value={block.heading} max={120} onChange={(x) => onChange({ heading: x })} />
      <Choice
        label="Show"
        value={block.source}
        onChange={(x) => onChange({ source: x })}
        options={[["featured", "Featured products"], ["new", "New arrivals"], ["category", "A category"], ["collection", "A collection"], ["manual", "Products I pick"]]}
      />
      {block.source === "category" ? (
        <Field label="Category">
          <select className={adminInput} value={block.category} onChange={(e) => onChange({ category: e.target.value })}>
            <option value="">Choose…</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </Field>
      ) : null}
      {block.source === "collection" ? (
        <Field label="Collection">
          <select className={adminInput} value={block.collectionSlug} onChange={(e) => onChange({ collectionSlug: e.target.value })}>
            <option value="">Choose…</option>
            {(collections.data ?? []).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </Field>
      ) : null}
      {block.source === "manual" ? (
        <div className="space-y-2">
          <span className="text-[13px] font-medium">Products ({block.productIds.length})</span>
          {block.productIds.map((pid, i) => (
            <div key={pid} className="flex items-center gap-1 rounded-lg border border-[#e3e3e3] px-2 py-1 text-[13px]">
              <span className="min-w-0 flex-1 truncate">{byId.get(pid)?.name ?? "Unavailable product"}</span>
              <IconBtn icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => { const next = [...block.productIds]; [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; onChange({ productIds: next }); }} />
              <IconBtn icon={ArrowDown} label="Move down" disabled={i === block.productIds.length - 1} onClick={() => { const next = [...block.productIds]; [next[i + 1], next[i]] = [next[i]!, next[i + 1]!]; onChange({ productIds: next }); }} />
              <IconBtn icon={X} label="Remove" onClick={() => onChange({ productIds: block.productIds.filter((x) => x !== pid) })} />
            </div>
          ))}
          <input className={adminInput} placeholder="Search a product to add…" value={term} onChange={(e) => setTerm(e.target.value)} />
          {term.trim() ? (
            <div className="rounded-lg border border-[#e3e3e3]">
              {matches.length === 0 ? <p className="p-2 text-xs text-[#616161]">No match.</p> : null}
              {matches.map((p) => (
                <button key={p.id} type="button" onClick={() => { onChange({ productIds: [...block.productIds, p.id] }); setTerm(""); }} className="block w-full truncate px-2 py-1.5 text-left text-[13px] hover:bg-[#f7f7f7]">
                  + {p.name} <span className="text-xs text-[#616161]">{p.sku}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <Field label={`Show up to ${block.limit} products`}>
        <input type="range" min={2} max={24} step={2} value={block.limit} onChange={(e) => onChange({ limit: Number(e.target.value) })} className="w-full accent-[#303030]" />
      </Field>
    </>
  );
}

/* ------------------------------------------------------------------ style tab */

const DEVICES: [Device, string][] = [["desktop", "Desktop"], ["tablet", "Tablet"], ["mobile", "Mobile"]];

export function StyleForm({ style, onChange, defaultPad }: { style: BlockStyle; onChange: (s: BlockStyle) => void; defaultPad: boolean }) {
  const hide = style.hideOn ?? [];
  return (
    <>
      <Choice label="Background" value={style.bg ?? "none"} options={[["none", "None"], ["surface", "Soft grey"], ["dark", "Dark"], ["red", `${brand.name} red`]]} onChange={(x) => onChange({ ...style, bg: x as BlockStyle["bg"] })} />
      <div>
        <Field label={style.padY === undefined ? `Space above and below: ${defaultPad ? "automatic" : "none"}` : `Space above and below: ${style.padY}px`}>
          <input type="range" min={0} max={160} step={8} value={style.padY ?? 0} onChange={(e) => onChange({ ...style, padY: Number(e.target.value) })} className="w-full accent-[#303030]" />
        </Field>
        {style.padY !== undefined ? <Btn variant="plain" onClick={() => { const { padY: _omit, ...rest } = style; void _omit; onChange(rest); }}>Back to automatic</Btn> : null}
      </div>
      <fieldset>
        <legend className="text-[13px] font-medium">Hide on</legend>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {DEVICES.map(([d, label]) => (
            <label key={d} className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" checked={hide.includes(d)} onChange={(e) => onChange({ ...style, hideOn: e.target.checked ? [...hide, d] : hide.filter((x) => x !== d) })} />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-[#616161]">Switch the canvas to that device to see the block disappear.</p>
      </fieldset>
    </>
  );
}
