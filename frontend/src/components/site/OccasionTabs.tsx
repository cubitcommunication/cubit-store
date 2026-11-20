import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { collectionsQuery, productsQuery } from "@/lib/catalog";
import { useMediaQuery } from "@/lib/use-media-query";
import { pickTabProducts, useOccasionSettings, useOccasions } from "@/lib/home-content";
import { useSiteText } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";
import { ProductCarousel } from "./ProductCarousel";
import { SmartLink } from "./SmartLink";

/**
 * "Shop by occasion" as real tabs. Each tab shows the first 4, 8 or 12 products of one collection
 * (set in Admin → Pages → Home page), with a "View more" button to that collection's page.
 * Switching tabs is instant because the products are already loaded.
 */
export function OccasionTabs() {
  const t = useSiteText();
  const tabs = useOccasions();
  const { count, viewMore } = useOccasionSettings();
  const collections = useQuery(collectionsQuery());
  const products = useQuery(productsQuery());
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  // Themed scroll bar under the tabs (phones and tablets). Drawn by hand because touch browsers hide the real one.
  const [bar, setBar] = useState({ show: false, width: 100, left: 0 });
  // Computers get a grid of 1–3 rows; phones and tablets swipe through a carousel (like Featured products).
  const desktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () => {
      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow <= 2) return setBar((b) => (b.show ? { show: false, width: 100, left: 0 } : b));
      const width = Math.max(12, (el.clientWidth / el.scrollWidth) * 100);
      setBar({ show: true, width, left: (el.scrollLeft / overflow) * (100 - width) });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  });

  const loading = collections.isPending || products.isPending;
  // A tab whose collection is hidden or deleted is left out, so visitors never see an empty dead tab.
  const usable = loading ? tabs : tabs.filter((tab) => (collections.data ?? []).some((c) => c.slug === tab.collection));
  if (!loading && usable.length === 0) return null;

  const index = Math.min(active, usable.length - 1);
  const tab = usable[index]!;
  const collection = (collections.data ?? []).find((c) => c.slug === tab.collection);
  const shown = collection ? pickTabProducts(products.data ?? [], collection, count) : [];

  function onKey(event: React.KeyboardEvent, i: number) {
    const next = event.key === "ArrowRight" ? i + 1 : event.key === "ArrowLeft" ? i - 1 : event.key === "Home" ? 0 : event.key === "End" ? usable.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const n = (next + usable.length) % usable.length;
    setActive(n);
    list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[n]?.focus();
  }

  return (
    <section className="section-surface product-cat-main mx-auto mt-20 max-w-[1400px] px-4 py-14 sm:px-6 sm:py-16 lg:mt-28 lg:px-10 lg:py-20">
      <h2 className="font-display text-3xl tracking-tight sm:text-4xl">{t("occasion_heading")}</h2>

      <div
        ref={list}
        role="tablist"
        aria-label={t("occasion_heading")}
        className="-mx-4 mt-7 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:mt-8 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {usable.map((o, i) => (
          <button
            key={`${o.label}-${i}`}
            id={`occasion-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls="occasion-panel"
            tabIndex={i === index ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "min-h-11 shrink-0 snap-start whitespace-nowrap rounded-lg border px-5 py-2.5 font-sans text-[0.8125rem] font-semibold uppercase leading-5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red sm:min-h-12 sm:px-6",
              i === index ? "border-brand-red bg-brand-red text-background" : "border-foreground/70 hover:border-brand-red hover:text-brand-red",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {bar.show ? (
        <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-brand-red/15 lg:hidden">
          <div className="h-full rounded-full bg-brand-red" style={{ width: `${bar.width}%`, marginLeft: `${bar.left}%` }} />
        </div>
      ) : null}

      <div id="occasion-panel" role="tabpanel" aria-labelledby={`occasion-tab-${index}`} className="mt-6 lg:mt-10">
        {!loading && shown.length === 0 ? (
          <p className="rounded-[12px] border border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No {tab.label.toLowerCase()} pieces yet. Please check back soon.
          </p>
        ) : !desktop ? (
          <ProductCarousel key={tab.collection} products={shown} isLoading={loading} label={tab.label} />
        ) : loading ? (
          <ul className="grid grid-cols-4 gap-x-6 gap-y-8">
            {Array.from({ length: count }).map((_, i) => (
              <li key={i}><ProductCardSkeleton /></li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-4 gap-x-6 gap-y-8">
            {shown.map((p, i) => (
              <li key={p.id} className="min-w-0">
                <ProductCard product={p} priority={i < 4} />
              </li>
            ))}
          </ul>
        )}

        {collection ? (
          <div className="mt-10 text-center">
            <SmartLink
              href={`/collection/${collection.slug}`}
              className="eyebrow inline-flex min-h-12 items-center justify-center rounded-lg border border-foreground px-9 py-3.5 transition-colors hover:border-brand-red hover:bg-brand-red hover:text-background"
            >
              {viewMore}
            </SmartLink>
          </div>
        ) : null}
      </div>
    </section>
  );
}
