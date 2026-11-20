import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CalendarHeart, Facebook, Gem, Instagram, Mail, Phone, Sparkles } from "lucide-react";
import { FaInstagram } from "react-icons/fa6";
import { brand } from "@/config/brand";
import { categoriesQuery, collectionsQuery, productsQuery } from "@/lib/catalog";
import { CATEGORY_NAV } from "@/lib/category-nav";
import { GRID_CLASS, hiddenClass, parseGrid, parseTiles, type TileConfig } from "@/lib/category-tiles";
import { cn } from "@/lib/utils";
import { useStoryBands } from "@/lib/home-content";
import { useSiteMedia } from "@/lib/site-media";
import { useContactInfo, useSiteText, useSiteTextExact } from "@/lib/site-settings";
import type { TeamBlock } from "@/lib/pages";
import { EditorialBand } from "@/components/site/EditorialBand";
import { OccasionTabs } from "@/components/site/OccasionTabs";
import { ProductCarousel } from "@/components/site/ProductCarousel";
import { ReelsSection } from "@/components/site/ReelsSection";
import { Reveal } from "@/components/site/Reveal";
import { SiteImage } from "@/components/site/SiteImage";
import { SmartLink } from "@/components/site/SmartLink";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { safeImage } from "@/lib/catalog";

/**
 * The sections of the built-in pages, as components. The built-in Home and Contact pages and the page builder's
 * "Site sections" blocks both draw these, so a change here shows up in both.
 */

const highlightIcons = [Gem, Sparkles, CalendarHeart];

export function HomeHero() {
  const t = useSiteText();
  const x = useSiteTextExact();
  return (
    <section className="relative bg-foreground text-background">
      <SiteImage
        mediaKey="homepage_hero"
        loading="eager"
        className="h-[78vh] min-h-[460px] w-full object-cover opacity-70 lg:h-[86vh]"
      />
      <div className="absolute inset-0 flex items-end">
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 sm:px-6 lg:px-10 lg:pb-20">
          <div className="shop-reveal max-w-3xl">
            <h1 className="font-display text-[2.6rem] leading-[0.98] tracking-tight sm:text-6xl lg:text-8xl">
              {t("hero_title")}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-background/85 sm:text-base">
              {t("hero_subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {x("hero_primary_url") ? (
                <SmartLink
                  href={x("hero_primary_url")}
                  className="eyebrow rounded-[12px] bg-brand-red px-7 py-4 text-background transition-opacity hover:opacity-90"
                >
                  {t("hero_primary_cta")}
                </SmartLink>
              ) : null}
              {x("hero_secondary_cta") && x("hero_secondary_url") ? (
                <SmartLink
                  href={x("hero_secondary_url")}
                  className="eyebrow rounded-[12px] border border-background/70 px-7 py-4 text-background transition-colors hover:bg-background hover:text-foreground"
                >
                  {x("hero_secondary_cta")}
                </SmartLink>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type Tile = { key: string; kind: "category" | "collection"; slug: string; label: string; image: string | null; mediaKey: string };

/** The tiles to show: the ones listed in the section, or every published category when the list is empty. */
function useTiles(configured: TileConfig[]): Tile[] {
  const custom = configured.length > 0;
  const categories = useQuery(categoriesQuery());
  const collections = useQuery({ ...collectionsQuery(), enabled: custom });
  if (!custom) {
    // Straight from Admin -> Categories (name and picture). The built-in four only stand in until the list has loaded
    // or when there are no categories yet.
    if (categories.data?.length) {
      return categories.data.map((c) => {
        const nav = CATEGORY_NAV.find((x) => x.slug === c.slug);
        return { key: `category:${c.slug}`, kind: "category", slug: c.slug, label: c.name.toUpperCase(), image: safeImage(c.image), mediaKey: nav?.mediaKey ?? "" };
      });
    }
    return CATEGORY_NAV.map((c) => ({ key: `category:${c.slug}`, kind: "category", slug: c.slug, label: c.label, image: null, mediaKey: c.mediaKey }));
  }
  const out: Tile[] = [];
  for (const c of configured) {
    if (c.kind === "category") {
      const row = categories.data?.find((x) => x.slug === c.slug);
      const nav = CATEGORY_NAV.find((x) => x.slug === c.slug);
      if (!row && !nav) continue;
      out.push({ key: `category:${c.slug}`, kind: "category", slug: c.slug, label: c.label || nav?.label || (row?.name ?? "").toUpperCase(), image: safeImage(c.image) ?? safeImage(row?.image), mediaKey: c.image ? "" : nav?.mediaKey ?? "" });
    } else {
      const row = collections.data?.find((x) => x.slug === c.slug);
      if (!row) continue;
      out.push({ key: `collection:${c.slug}`, kind: "collection", slug: c.slug, label: c.label || row.name, image: safeImage(c.image) ?? safeImage(row.image), mediaKey: "" });
    }
  }
  return out;
}

function TileImage({ tile, className }: { tile: Tile; className: string }) {
  if (tile.image) return <img src={tile.image} alt="" loading="lazy" decoding="async" className={className} />;
  if (tile.mediaKey) return <SiteImage mediaKey={tile.mediaKey} className={className} fallback={<div className={cn(className, "bg-muted")} />} />;
  return <div className={cn(className, "bg-muted")} aria-hidden="true" />;
}

function TileLink({ tile, className, children }: { tile: Tile; className: string; children: ReactNode }) {
  return tile.kind === "collection" ? (
    <Link to="/collection/$slug" params={{ slug: tile.slug }} className={className}>{children}</Link>
  ) : (
    <Link to="/collections/$category" params={{ category: tile.slug }} className={className}>{children}</Link>
  );
}

const TILE_FOCUS = "group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-red";

function TileCard({ tile, style }: { tile: Tile; style: string }) {
  if (style === "below" || style === "round") {
    const round = style === "round";
    return (
      <TileLink tile={tile} className={cn(TILE_FOCUS, round && "text-center")}>
        <div className={cn("relative isolate overflow-hidden bg-muted", round ? "mx-auto aspect-square w-full rounded-full" : "rounded-[12px]")}>
          <TileImage tile={tile} className={cn("w-full object-cover transition-transform duration-700 group-hover:scale-[1.07]", round ? "size-full" : "aspect-[3/4]")} />
        </div>
        <span className="eyebrow mt-3 block text-center transition-colors group-hover:text-brand-red">{tile.label}</span>
      </TileLink>
    );
  }
  if (style === "card") {
    return (
      <TileLink tile={tile} className={cn(TILE_FOCUS, "overflow-hidden rounded-[12px] border border-foreground/15 bg-background transition-shadow hover:shadow-md")}>
        <div className="relative isolate overflow-hidden bg-muted">
          <TileImage tile={tile} className="aspect-[3/4] w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
        </div>
        <span className="eyebrow block px-3 py-3 text-center transition-colors group-hover:text-brand-red">{tile.label}</span>
      </TileLink>
    );
  }
  return (
    <TileLink tile={tile} className={TILE_FOCUS}>
      <div className="relative isolate overflow-hidden rounded-[12px] bg-muted">
        <TileImage tile={tile} className="aspect-[3/4] w-full object-cover transition-transform duration-700 group-hover:scale-[1.07]" />
        <span className="absolute inset-x-0 bottom-0 bg-foreground/45 px-4 py-3 text-center text-background transition-colors group-hover:bg-brand-red">
          <span className="eyebrow">{tile.label}</span>
        </span>
      </div>
    </TileLink>
  );
}

export function HomeCategories() {
  const t = useSiteText();
  const grid = parseGrid(t);
  const tiles = useTiles(parseTiles(t("category_tiles_json")));
  return (
    <section className="section-surface product-cat-main mx-auto mt-20 max-w-[1400px] px-4 py-16 sm:px-6 lg:mt-28 lg:px-10 lg:py-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">{t("category_heading")}</h2>
        <Link to="/collections" className="eyebrow border-b border-foreground pb-0.5 hover:text-brand-red">
          {t("category_link_label")}
        </Link>
      </div>
      <ul className={cn("mt-10 grid gap-x-4 gap-y-8 sm:gap-x-6", GRID_CLASS.mobile[grid.mobile], GRID_CLASS.tablet[grid.tablet], GRID_CLASS.desktop[grid.desktop])}>
        {tiles.map((tile, i) => (
          <Reveal as="li" key={tile.key} delay={Math.min(i, 8) * 70} className={hiddenClass(i, grid)}>
            <TileCard tile={tile} style={grid.style} />
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export function HomeSeason() {
  const x = useSiteTextExact();
  return (
    x("season_enabled") !== "0" && (x("season_heading") || x("season_eyebrow")) ? (
      <section className="relative mt-20 bg-foreground text-background lg:mt-28">
        <div className="absolute inset-0 overflow-hidden">
          <SiteImage mediaKey="diwali_banner" className="size-full rounded-none object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/45 to-transparent max-md:bg-foreground/55" aria-hidden="true" />
        </div>
        <div className="relative mx-auto max-w-[1400px] px-4 py-20 sm:px-6 lg:px-10 lg:py-32">
          <Reveal className="max-w-xl">
            {x("season_eyebrow") ? <p className="eyebrow text-background/85">{x("season_eyebrow")}</p> : null}
            {x("season_heading") ? (
              <h2 className="mt-4 font-display text-4xl leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">{x("season_heading")}</h2>
            ) : null}
            {x("season_description") ? (
              <p className="mt-5 max-w-md text-sm leading-relaxed text-background/85 sm:text-base">{x("season_description")}</p>
            ) : null}
            {x("season_cta_label") && x("season_cta_url") ? (
              <SmartLink
                href={x("season_cta_url")}
                className="eyebrow mt-8 inline-block rounded-[12px] bg-brand-red px-7 py-4 text-background transition-opacity hover:opacity-90"
              >
                {x("season_cta_label")}
              </SmartLink>
            ) : null}
          </Reveal>
        </div>
      </section>
    ) : null
  );
}

export function HomeFeatured() {
  const t = useSiteText();
  const { data, isLoading, isError, refetch } = useQuery(productsQuery());
  const featured = (data ?? []).filter((p) => p.featured).slice(0, 12);
  return (
    <section className="product-cat-main mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:mt-28 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-brand-red">{t("featured_eyebrow")}</p>
          <h2 className="mt-3 font-display text-3xl tracking-tight sm:text-4xl">{t("featured_heading")}</h2>
        </div>
        <Link to="/shop" className="eyebrow border-b border-foreground pb-0.5 hover:text-brand-red">
          {t("featured_link_label")}
        </Link>
      </div>
      <div className="mt-10">
        <ProductCarousel
          products={featured}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyMessage="No featured pieces yet."
        />
      </div>
    </section>
  );
}

export function HomeStories() {
  const bands = useStoryBands();
  return (
    bands.length ? (
      <div className="mt-20 space-y-20 lg:mt-28 lg:space-y-28">
        {bands.map((band, i) => (
          <EditorialBand
            key={`${band.title}-${i}`}
            eyebrow={band.eyebrow}
            title={band.title}
            body={band.body}
            ctaLabel={band.cta}
            url={band.url}
            mediaKey={band.media}
            surface={i % 2 === 0}
            flip={i % 2 === 1}
          />
        ))}
      </div>
    ) : null
  );
}

export function HomeStory() {
  const t = useSiteText();
  const brandFeatures = [1, 2, 3].map((n, i) => ({ label: t(`highlight_${n}`), Icon: highlightIcons[i]! })).filter((f) => f.label);
  return (
    <section className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:mt-28 lg:px-10">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-6">
          <div className="overflow-hidden bg-muted">
            <SiteImage mediaKey="about_story" className="aspect-[4/5] w-full object-cover" />
          </div>
        </Reveal>
        <Reveal className="lg:col-span-6" delay={80}>
          <p className="eyebrow text-brand-red">{brand.foundedLabel}</p>
          <h2 className="mt-3 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
            {t("story_heading")}
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("story_body")}
          </p>
          <dl className="mt-9 grid grid-cols-1 border-y border-border sm:grid-cols-3">
            {brandFeatures.map(({ label, Icon }, index) => (
              <div
                key={label}
                className={`flex min-w-0 items-center gap-4 py-5 sm:flex-col sm:justify-center sm:gap-3 sm:px-4 sm:py-6 sm:text-center ${
                  index > 0 ? "border-t border-border sm:border-l sm:border-t-0" : ""
                }`}
              >
                <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-brand-red" strokeWidth={1.5} />
                <dt className="min-w-0 font-sans text-[0.8125rem] font-semibold uppercase leading-[1.45] tracking-[0.08em] text-foreground sm:max-w-36">
                  {label}
                </dt>
              </div>
            ))}
          </dl>
          <Link
            to="/about"
            className="eyebrow mt-8 inline-block border-b border-foreground pb-0.5 hover:text-brand-red"
          >
            {t("story_link_label")}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function HomeOccasions() {
  return <OccasionTabs />;
}

export function HomeReels() {
  return <ReelsSection />;
}

export function ContactBody() {
  const contact = useContactInfo();
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
      <Reveal className="lg:col-span-6">
        <a
          href={contact.generalEnquiryUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="eyebrow flex items-center justify-center gap-2 bg-brand-red px-8 py-5 text-background transition-opacity hover:opacity-90"
        >
          <WhatsAppIcon className="size-4" /> Enquire on WhatsApp
        </a>

        <ul className="mt-10 divide-y divide-border border-y border-border">
          <li>
            <a
              href={`tel:+${contact.phoneE164}`}
              className="flex items-center gap-4 py-5 transition-colors hover:text-brand-red"
            >
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="eyebrow block text-muted-foreground">Phone</span>
                {contact.phoneDisplay}
              </span>
            </a>
          </li>
          <li>
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-4 py-5 transition-colors hover:text-brand-red"
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="eyebrow block text-muted-foreground">Email</span>
                {contact.email}
              </span>
            </a>
          </li>
          <li>
            <a
              href={contact.instagramUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-4 py-5 transition-colors hover:text-brand-red"
            >
              <Instagram className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="eyebrow block text-muted-foreground">Instagram</span>
                {contact.instagramHandle}
              </span>
            </a>
          </li>
          <li>
            <a
              href={contact.facebookUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-4 py-5 transition-colors hover:text-brand-red"
            >
              <Facebook className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="eyebrow block text-muted-foreground">Facebook</span>
                {contact.facebookLabel}
              </span>
            </a>
          </li>
        </ul>
      </Reveal>

      <Reveal className="lg:col-span-6" delay={80}>
        <div className="overflow-hidden bg-muted">
          <SiteImage
            mediaKey="contact_image"
            className="aspect-[4/5] w-full object-cover"
          />
        </div>
      </Reveal>
    </div>
  );
}

/** People with a photo, name, role and link (the About page's co-founders). A photo can be "media:<site image key>". */
const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("");

function PersonPhoto({ src: value, name }: { src: string | null | undefined; name: string }) {
  const src = value ?? "";
  const key = src.startsWith("media:") ? src.slice(6) : "";
  const media = useSiteMedia(key);
  const url = key ? media.src : safeImage(src);
  if (!url) return <div className="flex size-full items-center justify-center font-display text-6xl text-muted-foreground/60" aria-hidden="true">{initials(name)}</div>;
  return <img src={url} alt={name} loading="lazy" decoding="async" className="size-full object-cover" />;
}

export function TeamSection({ b }: { b: TeamBlock }) {
  return (
    <section>
      <Reveal as="header" className="max-w-3xl">
        {b.eyebrow ? <p className="eyebrow text-brand-red">{b.eyebrow}</p> : null}
        {b.heading ? <h2 className="mt-3 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">{b.heading}</h2> : null}
      </Reveal>
      <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {b.items.map((p, i) => (
          <Reveal as="li" key={i} delay={i * 80} className="text-center">
            <div className="mx-auto aspect-[4/5] w-full max-w-[18rem] overflow-hidden rounded-[12px] bg-muted">
              <PersonPhoto src={p.image} name={p.name} />
            </div>
            <h3 className="mt-5 font-display text-xl tracking-tight">{p.name}</h3>
            {p.role ? <p className="eyebrow mt-1 text-brand-red">{p.role}</p> : null}
            {p.blurb ? <p className="mx-auto mt-3 max-w-[18rem] text-sm leading-relaxed text-muted-foreground">{p.blurb}</p> : null}
            {p.link ? (
              <SmartLink href={p.link} className="mt-4 inline-flex items-center gap-2 text-sm hover:text-brand-red" ariaLabel={`${p.name} on Instagram`}>
                <FaInstagram className="size-4" /> Instagram
              </SmartLink>
            ) : null}
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
