import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { bandById, priceBands, type Product } from "@/lib/catalog";
import { ProductGrid } from "@/components/site/ProductGrid";
import { SortMenu } from "@/components/site/SortMenu";
import { cn } from "@/lib/utils";

type CollectionSort = "featured" | "latest" | "price-asc" | "price-desc" | "name-asc" | "name-desc";

const SORT_OPTIONS: { value: CollectionSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "latest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
];

const PAGE_SIZE = 12;

function sortList(products: Product[], key: CollectionSort): Product[] {
  const list = [...products];
  switch (key) {
    case "latest":
      return list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    case "price-asc":
      return list.sort((a, b) => a.price - b.price);
    case "price-desc":
      return list.sort((a, b) => b.price - a.price);
    case "name-asc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return list.sort((a, b) => b.name.localeCompare(a.name));
    default:
      // Featured: featured pieces first, then new arrivals, otherwise the store's own order.
      return list.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.new_arrival) - Number(a.new_arrival));
  }
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-4 text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red",
        active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="eyebrow text-muted-foreground">{legend}</legend>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/** Sort + filter bar and product grid shared by every collection page. */
export function CollectionProducts({
  products,
  isLoading,
  isError,
  onRetry,
  emptyMessage = "This collection is being updated. Please check back soon.",
}: {
  products: Product[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<CollectionSort>("featured");
  const [price, setPrice] = useState<string | null>(null);
  const [materials, setMaterials] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [onSale, setOnSale] = useState(false);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Only offer choices that exist in this collection.
  const materialOptions = useMemo(() => [...new Set(products.map((p) => p.material).filter(Boolean))].sort(), [products]);
  const occasionOptions = useMemo(() => [...new Set(products.flatMap((p) => p.occasion ?? []))].sort(), [products]);
  const hasSale = useMemo(() => products.some((p) => p.compare_at_price && p.compare_at_price > p.price), [products]);
  const bands = useMemo(() => priceBands(products), [products]);

  const results = useMemo(() => {
    const band = bands.find((b) => b.id === price) ?? bandById(price);
    const filtered = products.filter((p) => {
      if (band && (p.price < band.min || p.price > band.max)) return false;
      if (materials.length && !materials.includes(p.material)) return false;
      if (occasions.length && !occasions.some((o) => (p.occasion ?? []).includes(o))) return false;
      if (onSale && !(p.compare_at_price && p.compare_at_price > p.price)) return false;
      return true;
    });
    return sortList(filtered, sort);
  }, [products, price, materials, occasions, onSale, sort]);

  useEffect(() => setVisible(PAGE_SIZE), [price, materials, occasions, onSale, sort]);

  const activeCount = (price ? 1 : 0) + materials.length + occasions.length + (onSale ? 1 : 0);
  const canFilter = bands.length > 1 || materialOptions.length > 1 || occasionOptions.length > 0 || hasSale;
  const toggle = (v: string, list: string[], set: (l: string[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const clear = () => {
    setPrice(null);
    setMaterials([]);
    setOccasions([]);
    setOnSale(false);
  };

  const activeChips: { key: string; label: string; remove: () => void }[] = [
    ...(price ? [{ key: "price", label: bands.find((b) => b.id === price)?.label ?? "Price", remove: () => setPrice(null) }] : []),
    ...materials.map((m) => ({ key: `m-${m}`, label: m, remove: () => toggle(m, materials, setMaterials) })),
    ...occasions.map((o) => ({ key: `o-${o}`, label: o, remove: () => toggle(o, occasions, setOccasions) })),
    ...(onSale ? [{ key: "sale", label: "On sale", remove: () => setOnSale(false) }] : []),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isLoading ? "Loading…" : results.length === products.length ? `${products.length} pieces` : `${results.length} of ${products.length} pieces`}
        </p>
        <div className="flex items-center gap-2.5">
          {canFilter ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={cn(
                "eyebrow flex h-11 items-center gap-2 rounded-full border px-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red",
                open ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground",
              )}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" /> Filter
              {activeCount ? <span className="rounded-full bg-brand-red px-1.5 text-background">{activeCount}</span> : null}
            </button>
          ) : null}
          <SortMenu<CollectionSort> value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </div>
      </div>

      {open && canFilter ? (
        <div className="shop-fade grid gap-6 border-b border-border bg-muted/40 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {bands.length > 1 ? (
            <Group legend="Price">
              {bands.map((b) => (
                <Chip key={b.id} active={price === b.id} onClick={() => setPrice(price === b.id ? null : b.id)}>
                  {b.label}
                </Chip>
              ))}
            </Group>
          ) : null}
          {materialOptions.length > 1 ? (
            <Group legend="Material">
              {materialOptions.map((m) => (
                <Chip key={m} active={materials.includes(m)} onClick={() => toggle(m, materials, setMaterials)}>
                  {m}
                </Chip>
              ))}
            </Group>
          ) : null}
          {occasionOptions.length > 0 ? (
            <Group legend="Occasion">
              {occasionOptions.map((o) => (
                <Chip key={o} active={occasions.includes(o)} onClick={() => toggle(o, occasions, setOccasions)}>
                  {o}
                </Chip>
              ))}
            </Group>
          ) : null}
          {hasSale ? (
            <Group legend="Offers">
              <Chip active={onSale} onClick={() => setOnSale((v) => !v)}>
                On sale
              </Chip>
            </Group>
          ) : null}
        </div>
      ) : null}

      {activeChips.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.remove}
              aria-label={`Remove filter ${c.label}`}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs hover:bg-foreground hover:text-background"
            >
              {c.label} <X className="size-3" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={clear} className="eyebrow ml-1 border-b border-foreground pb-0.5 hover:text-brand-red">
            Clear all
          </button>
        </div>
      ) : null}

      <div className="mt-8">
        <ProductGrid
          products={results.slice(0, visible)}
          isLoading={isLoading}
          isError={isError}
          onRetry={onRetry}
          emptyMessage={activeCount ? "No pieces match these filters." : emptyMessage}
        />
        {results.length > visible ? (
          <div className="mt-14 text-center">
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="eyebrow border border-foreground px-8 py-4 transition-colors hover:border-brand-red hover:bg-brand-red hover:text-background"
            >
              Load more
            </button>
          </div>
        ) : null}
        {activeCount && !results.length && !isLoading ? (
          <div className="mt-6 text-center">
            <button type="button" onClick={clear} className="eyebrow border-b border-foreground pb-0.5 hover:text-brand-red">
              Clear filters
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
