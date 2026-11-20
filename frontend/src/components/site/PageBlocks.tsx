import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { collectionsQuery, matchesCollection, productsQuery, safeImage, type Collection, type Product } from "@/lib/catalog";
import {
  parseVideo,
  SELF_CONTAINED,
  type Block,
  type ButtonBlock,
  type ColumnsBlock,
  type CtaBlock,
  type Device,
  type FaqBlock,
  type FeaturesBlock,
  type HeroBlock,
  type ImageBlock,
  type ImageTextBlock,
  type ProductsBlock,
  type SpacerBlock,
  type TextBlock,
  type VideoBlock,
} from "@/lib/pages";
import { ProductGrid } from "@/components/site/ProductGrid";
import { ContactBody, HomeCategories, HomeFeatured, HomeHero, HomeOccasions, HomeReels, HomeSeason, HomeStories, HomeStory, TeamSection } from "@/components/site/SiteBlocks";
import {
  CollectionHeaderBlock, CollectionProductsBlock, ProductBreadcrumbBlock, ProductGalleryBlock, ProductInfoBlock, ProductRelatedBlock, ProductSpecsBlock, ProductStickyBar,
} from "@/components/site/TemplateBlocks";
import { BlogList, CollectionsList, ShopListing } from "@/components/site/ListingBlocks";
import { useSiteMedia } from "@/lib/site-media";
import { SectionCtx } from "@/lib/section-ctx";
import { PremiumBlockView } from "@/components/site/PremiumBlocks";
import { isPremiumType, type PremiumBlock } from "@/lib/premium-blocks";
import { SmartLink } from "@/components/site/SmartLink";
import { cn } from "@/lib/utils";

/**
 * Draws a page made in the page builder. Used by the public /pages/<slug> route and by the editor's
 * live canvas (/page-preview), so what you see while editing is what visitors get.
 * All text is plain text (whitespace kept, never HTML); links go through SmartLink.
 * With `edit`, blocks can be clicked to select them and "+" bars appear between sections.
 */
export type EditApi = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Add a block at this position of the page. */
  onAddAt: (index: number) => void;
  /** Add a block to a column of a "columns" block. */
  onAddInColumn: (parentId: string, col: number) => void;
};

export function PageBlocks({ blocks, edit }: { blocks: Block[]; edit?: EditApi }) {
  const list = edit ? blocks : blocks.filter((b) => !b.hidden);
  return (
    <div className="page-blocks">
      {edit ? <AddBar onClick={() => edit.onAddAt(0)} label={list.length === 0 ? "Add your first section" : "Add section here"} big={list.length === 0} /> : null}
      {list.map((block, index) => (
        <div key={block.id}>
          <BlockView block={block} first={index === 0} edit={edit} />
          {edit ? <AddBar onClick={() => edit.onAddAt(index + 1)} label="Add section here" /> : null}
        </div>
      ))}
    </div>
  );
}

function AddBar({ onClick, label, big = false }: { onClick: () => void; label: string; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "group/add relative flex w-full items-center justify-center",
        big ? "min-h-[40vh] border-2 border-dashed border-[#9bb7e6] bg-[#f4f8ff] text-[#2c6ecb]" : "h-4 hover:h-9",
      )}
      aria-label={label}
    >
      <span className={cn("flex items-center gap-1.5 rounded-full bg-[#2c6ecb] px-3 py-1 text-xs font-semibold text-white", !big && "opacity-0 transition-opacity group-hover/add:opacity-100")}>
        <Plus className="size-3.5" />
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ shell */

const wrap = "mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10";
const buttonBase =
  "eyebrow inline-flex min-h-12 items-center justify-center rounded-lg px-7 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red";

const BG = {
  none: "",
  surface: "bg-surface",
  dark: "bg-foreground text-background [--muted-foreground:rgb(255_255_255/0.78)] [--border:rgb(255_255_255/0.22)]",
  red: "bg-brand-red text-background [--muted-foreground:rgb(255_255_255/0.85)] [--border:rgb(255_255_255/0.3)]",
} as const;

const HIDE: Record<Device, string> = { desktop: "lg:hidden", tablet: "sm:max-lg:hidden", mobile: "max-sm:hidden" };

/** Sections that bring their own spacing (or none). */
const OWN_SPACING = new Set<Block["type"]>(["hero", "spacer", ...SELF_CONTAINED]);
const FULL_BLEED = new Set<Block["type"]>(["hero", ...SELF_CONTAINED]);

/** A block picture: an uploaded address, or "media:<key>" for one of the site's own image slots (the site's built-in pictures). */
function useBlockImage(value: string | null | undefined): string | null {
  const src = value ?? "";
  const key = src.startsWith("media:") ? src.slice(6) : "";
  const media = useSiteMedia(key);
  return key ? (media.src ?? null) : safeImage(src);
}

function Shell({ block, nested, edit, children }: { block: Block; nested: boolean; edit: EditApi | undefined; children: React.ReactNode }) {
  const s = block.style ?? {};
  const selected = edit?.selectedId === block.id;
  const full = FULL_BLEED.has(block.type) || (block.type === "image" && block.width === "full");
  const pad = s.padY !== undefined ? { paddingTop: s.padY, paddingBottom: s.padY } : undefined;
  return (
    <div
      data-block-id={edit ? block.id : undefined}
      onClick={
        edit
          ? (e) => {
              e.stopPropagation();
              edit.onSelect(block.id);
            }
          : undefined
      }
      style={pad}
      className={cn(
        BG[s.bg ?? "none"],
        !nested && s.padY === undefined && !OWN_SPACING.has(block.type) && "py-6 lg:py-9",
        nested && s.bg && s.bg !== "none" && "rounded-[12px] px-6 sm:px-8",
        (s.hideOn ?? []).map((d) => HIDE[d]),
        edit && "relative cursor-pointer outline-2 -outline-offset-2 outline-transparent transition-[outline-color] hover:outline-[#8fb3ee]",
        edit && selected && "!outline-[#2c6ecb]",
        edit && block.hidden && "opacity-40",
      )}
    >
      {edit && selected ? <span className="pointer-events-none absolute left-0 top-0 z-10 bg-[#2c6ecb] px-2 py-0.5 text-[11px] font-semibold text-white">{block.type.replace("_", " ")}</span> : null}
      {full || nested ? children : <div className={wrap}>{children}</div>}
    </div>
  );
}

function BlockView({ block, first, edit, nested = false }: { block: Block; first: boolean; edit: EditApi | undefined; nested?: boolean }) {
  return (
    <Shell block={block} nested={nested} edit={edit}>
      <Content block={block} first={first} edit={edit} nested={nested} />
    </Shell>
  );
}

function Content({ block, first, edit, nested }: { block: Block; first: boolean; edit: EditApi | undefined; nested: boolean }) {
  switch (block.type) {
    case "hero":
      return <Hero b={block} />;
    case "text":
      return <TextSection b={block} first={first && !nested} />;
    case "image":
      return <ImageSection b={block} />;
    case "image_text":
      return <ImageText b={block} />;
    case "products":
      return <Products b={block} />;
    case "cta":
      return <Cta b={block} />;
    case "spacer":
      return <Spacer b={block} />;
    case "button":
      return <ButtonEl b={block} />;
    case "columns":
      return <Columns b={block} edit={edit} />;
    case "faq":
      return <Faq b={block} />;
    case "features":
      return <Features b={block} />;
    case "video":
      return <Video b={block} />;
    case "team":
      return <TeamSection b={block} />;
    case "site_hero":
      return <SectionCtx.Provider value={block.content ?? null}><HomeHero /></SectionCtx.Provider>;
    case "site_categories":
      return <SectionCtx.Provider value={block.content ?? null}><HomeCategories /></SectionCtx.Provider>;
    case "site_season":
      return <SectionCtx.Provider value={block.content ?? null}><HomeSeason /></SectionCtx.Provider>;
    case "site_featured":
      return <SectionCtx.Provider value={block.content ?? null}><HomeFeatured /></SectionCtx.Provider>;
    case "site_stories":
      return <SectionCtx.Provider value={block.content ?? null}><HomeStories /></SectionCtx.Provider>;
    case "site_occasions":
      return <SectionCtx.Provider value={block.content ?? null}><HomeOccasions /></SectionCtx.Provider>;
    case "site_story":
      return <SectionCtx.Provider value={block.content ?? null}><HomeStory /></SectionCtx.Provider>;
    case "site_reels":
      return <SectionCtx.Provider value={block.content ?? null}><HomeReels /></SectionCtx.Provider>;
    case "shop_listing":
      return <ShopListing />;
    case "collections_list":
      return <CollectionsList />;
    case "blog_list":
      return <BlogList />;
    case "site_contact":
      // The contact details sit in the page width like every other block (the section itself is full-bleed capable).
      return (
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-4 sm:px-6 lg:px-10">
          <SectionCtx.Provider value={block.content ?? null}><ContactBody /></SectionCtx.Provider>
        </div>
      );
    case "product_breadcrumb":
      return <ProductBreadcrumbBlock />;
    case "product_gallery":
      return <ProductGalleryBlock />;
    case "product_info":
      return <ProductInfoBlock />;
    case "product_specs":
      return <ProductSpecsBlock />;
    case "product_related":
      return <ProductRelatedBlock />;
    case "product_sticky_bar":
      return <ProductStickyBar />;
    case "collection_header":
      return <CollectionHeaderBlock />;
    case "collection_products":
      return <CollectionProductsBlock />;
    default:
      return isPremiumType(block.type) ? <PremiumBlockView block={block as unknown as PremiumBlock} /> : null;
  }
}

/* ------------------------------------------------------------------ blocks */

function Hero({ b }: { b: HeroBlock }) {
  const image = useBlockImage(b.image);
  const center = b.align === "center";
  return (
    <section className={cn("relative w-full overflow-hidden bg-foreground", b.height === "tall" ? "min-h-[72vh]" : "min-h-[46vh] sm:min-h-[52vh]")}>
      {image ? <img src={image} alt="" decoding="async" className="absolute inset-0 size-full object-cover opacity-80" /> : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-black/10" />
      <div className={cn("relative flex h-full min-h-[inherit] items-end", wrap)}>
        <div className={cn("w-full py-10 text-background sm:py-14", center && "mx-auto max-w-2xl text-center")}>
          {b.heading ? <h2 className="max-w-3xl font-display text-4xl leading-[1.04] tracking-tight sm:text-6xl">{b.heading}</h2> : null}
          {b.subheading ? <p className={cn("mt-4 max-w-xl whitespace-pre-line text-sm leading-relaxed text-background/85 sm:text-base", center && "mx-auto")}>{b.subheading}</p> : null}
          {b.buttonLabel && b.buttonLink ? (
            <SmartLink href={b.buttonLink} className={cn(buttonBase, "mt-7 bg-background text-foreground hover:bg-brand-red hover:text-background")}>
              {b.buttonLabel}
            </SmartLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TextSection({ b, first }: { b: TextBlock; first: boolean }) {
  const center = b.align === "center";
  return (
    <section className={cn(first && "lg:pt-6")}>
      <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
        {b.eyebrow ? <p className="eyebrow text-brand-red">{b.eyebrow}</p> : null}
        {b.heading ? <h2 className="mt-3 font-display text-3xl leading-tight tracking-tight sm:text-5xl">{b.heading}</h2> : null}
        {b.body ? <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base">{b.body}</p> : null}
      </div>
    </section>
  );
}

function ImageSection({ b }: { b: ImageBlock }) {
  const image = useBlockImage(b.image);
  if (!image) return <div className="flex aspect-[16/7] w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">Choose an image</div>;
  const img = <img src={image} alt={b.alt} loading="lazy" decoding="async" className={cn("w-full object-cover", b.width === "contained" && "rounded-lg")} />;
  return b.link ? (
    <SmartLink href={b.link} className="block" ariaLabel={b.alt || "Open link"}>
      {img}
    </SmartLink>
  ) : (
    img
  );
}

function ImageText({ b }: { b: ImageTextBlock }) {
  const image = useBlockImage(b.image);
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className={cn("overflow-hidden rounded-lg bg-surface", b.imageSide === "right" && "lg:order-2")}>
        {image ? <img src={image} alt={b.alt} loading="lazy" decoding="async" className="aspect-[4/5] w-full object-cover" /> : <LogoPlaceholder className="aspect-[4/5] w-full" />}
      </div>
      <div>
        {b.eyebrow ? <p className="eyebrow text-brand-red">{b.eyebrow}</p> : null}
        {b.heading ? <h2 className="mt-3 font-display text-3xl leading-tight tracking-tight sm:text-5xl">{b.heading}</h2> : null}
        {b.body ? <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base">{b.body}</p> : null}
        {b.buttonLabel && b.buttonLink ? (
          <SmartLink href={b.buttonLink} className={cn(buttonBase, "mt-7 bg-foreground text-background hover:bg-brand-red")}>
            {b.buttonLabel}
          </SmartLink>
        ) : null}
      </div>
    </div>
  );
}

/** Picks the products for a grid block. Prices, stock and publishing always come from the server data. */
function pickProducts(b: ProductsBlock, all: Product[], collections: Collection[]): Product[] {
  let list: Product[] = [];
  switch (b.source) {
    case "featured":
      list = all.filter((p) => p.featured);
      break;
    case "new":
      list = all.filter((p) => p.new_arrival);
      break;
    case "category":
      list = b.category ? all.filter((p) => p.category === b.category) : [];
      break;
    case "collection": {
      const c = collections.find((x) => x.slug === b.collectionSlug);
      list = c ? all.filter((p) => matchesCollection(p, c)) : [];
      break;
    }
    default: {
      const byId = new Map(all.map((p) => [p.id, p]));
      list = b.productIds.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
    }
  }
  return list.slice(0, Math.max(1, Math.min(48, b.limit || 8)));
}

function Products({ b }: { b: ProductsBlock }) {
  const { data, isLoading, isError, refetch } = useQuery(productsQuery());
  const collections = useQuery(collectionsQuery()).data ?? [];
  const products = pickProducts(b, data ?? [], collections);
  if (!isLoading && !isError && products.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No products match this grid yet.</p>;
  }
  return (
    <div>
      {b.heading ? <h2 className="mb-6 font-display text-2xl tracking-tight sm:text-4xl">{b.heading}</h2> : null}
      <ProductGrid products={products} isLoading={isLoading} isError={isError} onRetry={() => refetch()} skeletonCount={4} />
    </div>
  );
}

const ctaTone = {
  dark: "bg-foreground text-background",
  light: "bg-surface text-foreground",
  red: "bg-brand-red text-background",
} as const;

function Cta({ b }: { b: CtaBlock }) {
  return (
    <div className={cn("rounded-lg px-6 py-12 text-center sm:px-12 sm:py-16", ctaTone[b.tone] ?? ctaTone.dark)}>
      {b.heading ? <h2 className="mx-auto max-w-2xl font-display text-3xl leading-tight tracking-tight sm:text-5xl">{b.heading}</h2> : null}
      {b.body ? <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-sm leading-relaxed opacity-85 sm:text-base">{b.body}</p> : null}
      {b.buttonLabel && b.buttonLink ? (
        <SmartLink
          href={b.buttonLink}
          className={cn(buttonBase, "mt-7", b.tone === "light" ? "bg-foreground text-background hover:bg-brand-red" : "bg-background text-foreground hover:bg-foreground hover:text-background")}
        >
          {b.buttonLabel}
        </SmartLink>
      ) : null}
    </div>
  );
}

function Spacer({ b }: { b: SpacerBlock }) {
  const height = Math.max(8, Math.min(240, Number(b.height) || 48));
  return (
    <div className="flex items-center" style={{ height }} aria-hidden="true">
      {b.divider ? <hr className="w-full border-border" /> : null}
    </div>
  );
}

function ButtonEl({ b }: { b: ButtonBlock }) {
  if (!b.label || !b.link) return <p className="text-center text-xs text-muted-foreground">Add a label and a link to this button.</p>;
  const align = b.align === "left" ? "justify-start" : b.align === "right" ? "justify-end" : "justify-center";
  return (
    <div className={cn("flex", align)}>
      <SmartLink
        href={b.link}
        className={cn(
          buttonBase,
          b.fullWidth && "w-full",
          b.variant === "outline" ? "border border-current bg-transparent hover:bg-foreground hover:text-background" : "bg-foreground text-background hover:bg-brand-red",
        )}
      >
        {b.label}
      </SmartLink>
    </div>
  );
}

const COLS: Record<ColumnsBlock["layout"], string> = {
  "1-1": "md:grid-cols-2",
  "1-1-1": "md:grid-cols-3",
  "1-1-1-1": "sm:grid-cols-2 lg:grid-cols-4",
  "1-2": "lg:grid-cols-[1fr_2fr]",
  "2-1": "lg:grid-cols-[2fr_1fr]",
};
const GAP = { sm: "gap-4", md: "gap-6 lg:gap-10", lg: "gap-8 lg:gap-14" } as const;

function Columns({ b, edit }: { b: ColumnsBlock; edit: EditApi | undefined }) {
  return (
    <div className={cn("grid", COLS[b.layout], GAP[b.gap] ?? GAP.md, b.valign === "center" && "items-center")}>
      {b.columns.map((col, c) => (
        <div key={c} className="flex min-w-0 flex-col gap-5">
          {(edit ? col : col.filter((x) => !x.hidden)).map((child) => (
            <BlockView key={child.id} block={child} first={false} edit={edit} nested />
          ))}
          {edit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                edit.onAddInColumn(b.id, c);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#9bb7e6] text-xs font-semibold text-[#2c6ecb] hover:bg-[#f4f8ff]",
                col.length === 0 ? "min-h-28" : "h-9",
              )}
            >
              <Plus className="size-3.5" />
              {col.length === 0 ? "Add to this column" : "Add"}
            </button>
          ) : col.length === 0 ? (
            <div />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Faq({ b }: { b: FaqBlock }) {
  return (
    <div className="mx-auto max-w-3xl">
      {b.heading ? <h2 className="mb-6 text-center font-display text-3xl tracking-tight sm:text-4xl">{b.heading}</h2> : null}
      <div className="divide-y divide-border border-y border-border">
        {b.items.filter((i) => i.q).map((item, i) => (
          <details key={i} className="group py-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-2 text-left text-sm font-semibold sm:text-base [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus className="size-4 shrink-0 transition-transform group-open:rotate-45" aria-hidden="true" />
            </summary>
            <p className="whitespace-pre-line pb-4 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

const PER_ROW = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

function Features({ b }: { b: FeaturesBlock }) {
  return (
    <div>
      {b.heading ? <h2 className="mb-6 text-center font-display text-3xl tracking-tight sm:text-4xl">{b.heading}</h2> : null}
      <div className={cn("grid gap-4", PER_ROW[b.perRow] ?? PER_ROW[3])}>
        {b.items.map((item, i) => (
          <div key={i} className="rounded-lg border border-border p-6 text-center">
            <h3 className="font-display text-lg tracking-tight">{item.title}</h3>
            {item.body ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{item.body}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Video({ b }: { b: VideoBlock }) {
  const video = parseVideo(b.url ?? "");
  return (
    <figure className="mx-auto max-w-4xl">
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-foreground">
        {video?.kind === "iframe" ? (
          <iframe src={video.src} title={b.caption || "Video"} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="size-full border-0" />
        ) : video?.kind === "file" ? (
          <video src={video.src} controls playsInline preload="metadata" className="size-full" />
        ) : (
          <div className="flex size-full items-center justify-center px-4 text-center text-xs text-background/70">Paste a YouTube, Vimeo or .mp4 (https) link</div>
        )}
      </div>
      {b.caption ? <figcaption className="mt-2 text-center text-xs text-muted-foreground">{b.caption}</figcaption> : null}
    </figure>
  );
}
