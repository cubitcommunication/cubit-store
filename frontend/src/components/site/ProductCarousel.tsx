import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";
import { ProductGrid } from "./ProductGrid";

type Props = {
  products: Product[];
  isLoading?: boolean | undefined;
  isError?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  emptyMessage?: string | undefined;
  /** Screen-reader name of the carousel. */
  label?: string | undefined;
};

/**
 * Swipeable product row. Phones show one card and a peek of the next, small tablets two and a
 * half, tablets three, desktops four. Arrow buttons appear from tablet width up; touch users swipe.
 */
const slide =
  "min-w-0 shrink-0 grow-0 basis-[72%] pl-3 min-[480px]:basis-[48%] sm:pl-4 md:basis-[34%] lg:basis-1/4";

export function ProductCarousel({ products, isLoading, isError, onRetry, emptyMessage, label = "Featured products" }: Props) {
  const [viewport, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", slidesToScroll: 1, dragFree: false });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const sync = useCallback(() => {
    if (!api) return;
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    sync();
    api.on("select", sync).on("reInit", sync).on("resize", sync);
    return () => {
      api.off("select", sync).off("reInit", sync).off("resize", sync);
    };
  }, [api, sync]);

  // Errors and empty lists reuse the grid's friendly messages.
  if (isError || (!isLoading && !products.length)) {
    return <ProductGrid {...{ products, isError, onRetry, emptyMessage }} />;
  }

  const arrow = (dir: "prev" | "next") => {
    const enabled = dir === "prev" ? canPrev : canNext;
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        aria-label={dir === "prev" ? "Previous products" : "Next products"}
        disabled={!enabled}
        onClick={() => (dir === "prev" ? api?.scrollPrev() : api?.scrollNext())}
        className={cn(
          "absolute top-[38%] z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-md transition-all hover:border-brand-red hover:bg-brand-red hover:text-background md:flex",
          dir === "prev" ? "left-2 lg:-left-3" : "right-2 lg:-right-3",
          !enabled && "pointer-events-none opacity-0",
        )}
      >
        <Icon className="size-5" />
      </button>
    );
  };

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} className="relative">
      <div ref={viewport} className="overflow-hidden">
        <ul className="-ml-3 flex touch-pan-y sm:-ml-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className={slide}>
                  <ProductCardSkeleton />
                </li>
              ))
            : products.map((p, i) => (
                <li key={p.id} className={cn(slide, "flex")} aria-roledescription="slide">
                  <div className="w-full min-w-0">
                    <ProductCard product={p} priority={i < 4} />
                  </div>
                </li>
              ))}
        </ul>
      </div>
      {arrow("prev")}
      {arrow("next")}
    </div>
  );
}
