import { CURRENCY } from "@/config/brand";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { VideoPicker } from "@/components/admin/VideoPicker";
import { combinations, variantTitle, type ProductOption, type Selection, type Variant } from "@/lib/variants";
import type { ProductSaveVariant } from "@/lib/product-save.functions";

/** One editable variant row (numbers are kept as text while typing). */
export type VariantDraft = {
  id?: string | undefined;
  options: Selection;
  sku: string;
  price: string;
  stock: string;
  image_url: string;
  video_url: string;
};

export const toDraft = (v: Variant): VariantDraft => ({
  id: v.id,
  options: v.options,
  sku: v.sku ?? "",
  price: v.price == null ? "" : String(v.price),
  stock: v.stock_quantity == null ? "" : String(v.stock_quantity),
  image_url: v.image_url ?? "",
  video_url: v.video_url ?? "",
});

export const draftsToPayload = (drafts: VariantDraft[]): ProductSaveVariant[] =>
  drafts.map((d) => ({
    id: d.id,
    options: d.options,
    sku: d.sku.trim() || null,
    price: d.price.trim() === "" ? null : Number(d.price),
    stock_quantity: d.stock.trim() === "" ? null : Math.max(0, Math.trunc(Number(d.stock)) || 0),
    image_url: d.image_url || null,
    video_url: d.video_url || null,
  }));

const keyOf = (selection: Selection) => JSON.stringify(Object.entries(selection));

/**
 * Options builder (Size, Colour…) with a generated variants table, like Shopify's product page.
 * Variants that still match after an edit keep their price, stock, SKU and photo.
 */
export function VariantsEditor({
  options,
  variants,
  onChange,
  images,
  basePrice,
}: {
  options: ProductOption[];
  variants: VariantDraft[];
  onChange: (next: { options: ProductOption[]; variants: VariantDraft[] }) => void;
  images: string[];
  basePrice: string;
}) {
  const enabled = options.length > 0;
  const [texts, setTexts] = useState<string[]>(() => options.map((o) => o.values.join(", ")));
  const first = useRef(true);

  // Keep the text boxes in step if options are replaced from outside (e.g. the product loads).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTexts((prev) => (prev.length === options.length ? prev : options.map((o) => o.values.join(", "))));
  }, [options.length]);

  const parse = (text: string) => [...new Set(text.split(",").map((v) => v.trim()).filter(Boolean))];

  /** Rebuild the variants table for these options, keeping rows whose combination still exists. */
  function regenerate(nextOptions: ProductOption[]) {
    const complete = nextOptions.filter((o) => o.name.trim() && o.values.length);
    if (!complete.length) {
      onChange({ options: nextOptions, variants: [] });
      return;
    }
    const existing = new Map(variants.map((v) => [keyOf(v.options), v]));
    const next = combinations(complete.map((o) => ({ name: o.name.trim(), values: o.values }))).map(
      (combo) => existing.get(keyOf(combo)) ?? { options: combo, sku: "", price: "", stock: "", image_url: "", video_url: "" },
    );
    onChange({ options: nextOptions, variants: next });
  }

  const setOption = (index: number, patch: Partial<ProductOption>, rebuild = false) => {
    const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    if (rebuild) regenerate(next);
    else onChange({ options: next, variants });
  };

  const setVariant = (index: number, patch: Partial<VariantDraft>) =>
    onChange({ options, variants: variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) });

  return (
    <fieldset className="border border-border bg-background p-5">
      <legend className="eyebrow px-2">Variants</legend>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (e.target.checked) {
              setTexts([""]);
              onChange({ options: [{ name: "Size", values: [] }], variants: [] });
            } else {
              setTexts([]);
              onChange({ options: [], variants: [] });
            }
          }}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">This product has options, like size or colour</span>
          <span className="block text-xs text-muted-foreground">
            Each combination becomes a variant with its own price, stock and photo. Customers choose their option before adding to the cart.
          </span>
        </span>
      </label>

      {enabled ? (
        <div className="mt-5 space-y-4">
          {options.map((option, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
              <label className="block text-sm">
                Option name
                <input
                  value={option.name}
                  onChange={(e) => setOption(index, { name: e.target.value })}
                  onBlur={() => regenerate(options)}
                  placeholder="Size, Colour…"
                  className="mt-1 w-full"
                />
              </label>
              <label className="block text-sm">
                Values <span className="text-xs text-muted-foreground">(separate with commas)</span>
                <input
                  value={texts[index] ?? ""}
                  onChange={(e) => {
                    const text = e.target.value;
                    setTexts((prev) => prev.map((t, i) => (i === index ? text : t)));
                    setOption(index, { values: parse(text) });
                  }}
                  onBlur={() => regenerate(options)}
                  placeholder="6, 7, 8   or   Gold, Silver"
                  className="mt-1 w-full"
                />
              </label>
              <button
                type="button"
                title="Remove option"
                aria-label="Remove option"
                onClick={() => {
                  setTexts((prev) => prev.filter((_, i) => i !== index));
                  regenerate(options.filter((_, i) => i !== index));
                }}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-brand-red"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          {options.length < 3 ? (
            <button
              type="button"
              onClick={() => {
                setTexts((prev) => [...prev, ""]);
                onChange({ options: [...options, { name: "", values: [] }], variants });
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#005bd3] hover:underline"
            >
              <Plus className="size-4" /> Add another option
            </button>
          ) : null}

          {variants.length ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>SKU</th>
                    <th>Price ({CURRENCY})</th>
                    <th>Stock</th>
                    <th>Photo</th>
                    <th>Video (no sound)</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => (
                    <tr key={keyOf(v.options)} className="border-t">
                      <td className="whitespace-nowrap font-medium">{variantTitle(v.options)}</td>
                      <td><input value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} aria-label={`SKU for ${variantTitle(v.options)}`} placeholder="Optional" className="w-28" /></td>
                      <td><input value={v.price} onChange={(e) => setVariant(i, { price: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" aria-label={`Price for ${variantTitle(v.options)}`} placeholder={basePrice || "Same as product"} className="w-28" /></td>
                      <td><input value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" aria-label={`Stock for ${variantTitle(v.options)}`} placeholder="Not tracked" className="w-24" /></td>
                      <td>
                        <select value={v.image_url} onChange={(e) => setVariant(i, { image_url: e.target.value })} aria-label={`Photo for ${variantTitle(v.options)}`} className="w-32">
                          <option value="">Default photo</option>
                          {images.map((url, n) => (
                            <option key={url} value={url}>Photo {n + 1}</option>
                          ))}
                        </select>
                      </td>
                      <td><VideoPicker compact label={`Video for ${variantTitle(v.options)}`} value={v.video_url} onChange={(url) => setVariant(i, { video_url: url })} /></td>
                      <td>
                        <button
                          type="button"
                          title="Remove this variant"
                          aria-label={`Remove ${variantTitle(v.options)}`}
                          onClick={() => onChange({ options, variants: variants.filter((_, n) => n !== i) })}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-brand-red"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Type the option values above and the variants will appear here.</p>
          )}
          <p className="text-xs text-muted-foreground">Leave a variant's price blank to use the product price. Leave stock blank to not track it.</p>
        </div>
      ) : null}
    </fieldset>
  );
}
