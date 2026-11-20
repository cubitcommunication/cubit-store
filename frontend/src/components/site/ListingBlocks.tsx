import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { applyFilters, categoriesQuery, collectionsQuery, priceBands, productsQuery, safeImage, sortProducts, type Filters, type SortKey } from "@/lib/catalog";
import { MATERIALS as BRAND_MATERIALS, OCCASIONS, brand, LOCALE } from "@/config/brand";
import { blogListQuery, parseTags, type PostCard } from "@/lib/pages";
import { ProductGrid } from "@/components/site/ProductGrid";
import { SortMenu } from "@/components/site/SortMenu";
import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { Reveal } from "@/components/site/Reveal";
import { ProductGridSkeleton } from "@/components/ui/loading-rows";

/**
 * The live listings of the built-in pages (shop, collections, blog), as blocks, so the page builder can
 * place them under its own headings and pictures. The built-in routes draw the same components.
 */

const PAGE_SIZE = 12;

/** Search box, filters, sort and product grid of /shop. */
export function ShopListing() {
  const search = useSearch({ strict: false }) as { q?: string };
  const q = search.q ?? "";
  const navigate = useNavigate() as unknown as (o: { search: Record<string, string> }) => void;
  const { data, isLoading, isError, refetch } = useQuery(productsQuery());
  const dbCategories = useQuery(categoriesQuery()).data;
  // The categories added in Admin → Categories.
  const categoryOptions = useMemo(() => (dbCategories ?? []).map((c) => c.name), [dbCategories]);

  const [categories, setCategories] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [price, setPrice] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [panelOpen, setPanelOpen] = useState(false);

  const filters: Filters = { q, categories, materials, occasions, price };

  const results = useMemo(() => {
    if (!data) return [];
    return sortProducts(applyFilters(data, filters), sort);
  }, [data, q, categories, materials, occasions, price, sort]);

  const activeCount = categories.length + materials.length + occasions.length + (price ? 1 : 0);

  function toggle(value: string, list: string[], setter: (v: string[]) => void) {
    setVisible(PAGE_SIZE);
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function clearAll() {
    setCategories([]);
    setMaterials([]);
    setOccasions([]);
    setPrice(null);
    setVisible(PAGE_SIZE);
    navigate({ search: {} });
  }

  const bands = useMemo(() => priceBands(data ?? []), [data]);

  const filterGroups = (
    <div className="space-y-8">
      <FilterGroup
        legend="Category"
        options={categoryOptions}
        selected={categories}
        onToggle={(v) => toggle(v, categories, setCategories)}
      />
      <FilterGroup
        legend="Material"
        options={[...BRAND_MATERIALS]}
        selected={materials}
        onToggle={(v) => toggle(v, materials, setMaterials)}
      />
      <FilterGroup
        legend="Occasion"
        options={[...OCCASIONS]}
        selected={occasions}
        onToggle={(v) => toggle(v, occasions, setOccasions)}
      />
      <fieldset>
        <legend className="eyebrow text-muted-foreground">Price</legend>
        <div className="mt-4 space-y-2.5">
          {bands.map((band) => (
            <label key={band.id} className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name="price"
                className="size-4 accent-brand-red"
                checked={price === band.id}
                onChange={() => {
                  setPrice(price === band.id ? null : band.id);
                  setVisible(PAGE_SIZE);
                }}
              />
              {band.label}
            </label>
          ))}
        </div>
      </fieldset>
      {activeCount || q ? (
        <button
          type="button"
          onClick={clearAll}
          className="eyebrow border-b border-foreground pb-0.5 hover:text-brand-red"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6 lg:px-10">
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="mt-10 flex items-center gap-3 border-b border-foreground pb-3"
      >
        <label htmlFor="shop-search" className="sr-only">
          Search products
        </label>
        <input
          id="shop-search"
          value={q}
          onChange={(e) => {
            setVisible(PAGE_SIZE);
            navigate({ search: e.target.value ? { q: e.target.value } : {} });
          }}
          placeholder="Search by name, SKU, material, occasion…"
          className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-muted-foreground"
        />
        {q ? (
          <button
            type="button"
            onClick={() => navigate({ search: {} })}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-brand-red"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </form>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <p className="col-span-2 text-sm text-muted-foreground sm:order-2 sm:col-span-1" aria-live="polite">
          {isLoading ? "Loading…" : `${results.length} pieces`}
        </p>
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="eyebrow flex h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground px-5 transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red sm:w-auto lg:hidden"
          aria-expanded={panelOpen}
        >
          <SlidersHorizontal className="size-4" /> Filters
          {activeCount ? <span className="rounded-full bg-brand-red px-1.5 text-background">{activeCount}</span> : null}
        </button>
        <SortMenu<SortKey>
          className="sm:order-3"
          value={sort}
          onChange={(v) => {
            setSort(v);
            setVisible(PAGE_SIZE);
          }}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "price-asc", label: "Price: low to high" },
            { value: "price-desc", label: "Price: high to low" },
            { value: "name-asc", label: "Name: A to Z" },
          ]}
        />
      </div>

      {panelOpen ? <div className="mt-8 border border-border p-5 lg:hidden">{filterGroups}</div> : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-14">
        <aside className="hidden lg:block" aria-label="Filters">
          {filterGroups}
        </aside>
        <div className="product-cat-main">
          <ProductGrid
            products={results.slice(0, visible)}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
          />
          {results.length > visible ? (
            <div className="mt-14 text-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="eyebrow border border-foreground px-8 py-4 transition-colors hover:bg-brand-red hover:border-brand-red hover:text-background"
              >
                Load more
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="eyebrow text-muted-foreground">{legend}</legend>
      <div className="mt-4 space-y-2.5">
        {options.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-brand-red"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Material shortcuts and the collection pictures of /collections, grouped. */
export function CollectionsList() {
  const { data, isLoading, isError, refetch } = useQuery(collectionsQuery());
  const groups = (data ?? []).reduce<Record<string, typeof data>>((acc, c) => {
    const key = c.group_name ?? "Collections";
    (acc[key] ||= [] as any)!.push(c);
    return acc;
  }, {});
  return (
    <div className="product-cat-main mx-auto max-w-[1400px] px-4 pb-24 sm:px-6 lg:px-10">
      {isError ? (
        <div className="mt-16 border border-border px-6 py-16 text-center">
          <p className="font-display text-xl">Something went wrong. Please try again.</p>
          <button type="button" onClick={() => refetch()} className="eyebrow mt-5 bg-foreground px-5 py-3 text-background hover:bg-brand-red">Try again</button>
        </div>
      ) : null}
      {isLoading ? (
        <div className="mt-16 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} aria-hidden="true"><div className="aspect-[4/5] soft-load rounded-lg" /><div className="soft-load mt-4 h-4 w-32 rounded-full" /></div>
          ))}
        </div>
      ) : null}
      {Object.entries(groups).map(([group, items]) => (
        <section key={group} className="mt-16 lg:mt-24">
          <h2 className="eyebrow border-b border-border pb-4 text-muted-foreground">{group}</h2>
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
            {(items ?? []).map((c, i) => {
              const img = safeImage(c.image);
              return (
                <Reveal as="li" key={c.id} delay={Math.min(i, 5) * 60}>
                  <Link to="/collection/$slug" params={{ slug: c.slug }} className="group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-red">
                    <div className="isolate overflow-hidden rounded-[12px] bg-muted">
                      <div className="aspect-[4/5]">
                        {img ? <img src={img} alt={`${c.name} collection by ${brand.name}`} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.06]" /> : <LogoPlaceholder className="size-full" />}
                      </div>
                    </div>
                    <h3 className="mt-4 font-display text-lg leading-snug tracking-tight transition-colors group-hover:text-brand-red">{c.name}</h3>
                    {c.description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.description}</p> : null}
                  </Link>
                </Reveal>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function postDate(p: Pick<PostCard, "published_at" | "created_at">): string {
  const raw = p.published_at ?? p.created_at;
  const d = new Date(raw.replace(" ", "T") + (raw.includes("T") || raw.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

/** Topic filter and the grid of published blog posts. */
export function BlogList() {
  const { tag } = useSearch({ strict: false }) as { tag?: string };
  const { data, isPending } = useQuery(blogListQuery());
  const all = data ?? [];
  const allTags = [...new Set(all.flatMap((p) => parseTags(p.tags)))].sort((a, b) => a.localeCompare(b));
  const posts = tag ? all.filter((p) => parseTags(p.tags).some((t) => t.toLowerCase() === tag.toLowerCase())) : all;
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6 lg:px-10">
      {allTags.length ? (
        <nav aria-label="Filter by topic" className="flex flex-wrap gap-2">
          <Link to="/blog" className={`rounded-full border px-4 py-1.5 text-xs font-medium ${!tag ? "border-foreground bg-foreground text-background" : "border-border hover:border-brand-red hover:text-brand-red"}`}>All</Link>
          {allTags.map((t) => (
            <Link key={t} to="/blog" search={{ tag: t }} className={`rounded-full border px-4 py-1.5 text-xs font-medium ${tag?.toLowerCase() === t.toLowerCase() ? "border-foreground bg-foreground text-background" : "border-border hover:border-brand-red hover:text-brand-red"}`}>{t}</Link>
          ))}
        </nav>
      ) : null}

      {isPending && !data ? (
        <ProductGridSkeleton />
      ) : posts.length === 0 ? (
        <p className="mt-16 border border-border px-6 py-16 text-center text-sm text-muted-foreground">{tag ? "No posts under this topic yet." : "No posts yet. Please check back soon."}</p>
      ) : (
        <ul className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p, i) => <PostTile key={p.id} post={p} delay={Math.min(i, 5) * 60} />)}
        </ul>
      )}
    </div>
  );
}

export function PostTile({ post, delay = 0 }: { post: PostCard; delay?: number }) {
  const img = safeImage(post.cover_url);
  const tags = parseTags(post.tags);
  return (
    <Reveal as="li" delay={delay} className="min-w-0">
      <Link to="/blog/$slug" params={{ slug: post.slug }} className="group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-red">
        <div className="isolate aspect-[4/3] overflow-hidden rounded-[12px] bg-muted">
          {img ? <img src={img} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" /> : <LogoPlaceholder className="size-full" />}
        </div>
        <p className="eyebrow mt-4 text-brand-red">{tags[0] ?? "Journal"}</p>
        <h2 className="mt-2 font-display text-xl leading-snug tracking-tight transition-colors group-hover:text-brand-red sm:text-2xl">{post.title}</h2>
        {post.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p> : null}
        <p className="mt-3 text-xs text-muted-foreground">{[postDate(post), post.author].filter(Boolean).join(" · ")}</p>
      </Link>
    </Reveal>
  );
}

