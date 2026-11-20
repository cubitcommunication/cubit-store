import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/catalog";
import { Reveal } from "./Reveal";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";
import { useAppearance, usePreviewState } from "@/lib/appearance";
import { combinations, type ProductOption } from "@/lib/variants";

type Props = {
  products: Product[];
  isLoading?: boolean | undefined;
  isError?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  emptyMessage?: string | undefined;
  skeletonCount?: number | undefined;
};

export function ProductGrid({
  products,
  isLoading,
  isError,
  onRetry,
  emptyMessage = "No products found.",
  skeletonCount = 8,
}: Props) {
  const { columns } = useAppearance();
  const preview = usePreviewState();
  const cols = columns === 3 ? "lg:grid-cols-3" : columns === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
  // In the admin preview, give the first two products demo options so the variant chips can be seen.
  if (preview?.demo) products = products.map((p, i) => (i < 2 && !p.options?.length ? withDemoVariants(p, i) : p));

  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 ${cols}`}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border border-border px-6 py-16 text-center">
        <p className="font-display text-xl">Something went wrong. Please try again.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="eyebrow mt-5 bg-foreground px-5 py-3 text-background transition-colors hover:bg-brand-red"
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="border border-border px-6 py-16 text-center">
        <p className="font-display text-xl">{emptyMessage}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Try a different search or fewer filters.
        </p>
        <Link
          to="/shop"
          className="eyebrow mt-5 inline-block border-b border-foreground pb-0.5 hover:text-brand-red"
        >
          Browse all products
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
      {products.map((p, i) => (
        <Reveal as="li" key={p.id} delay={Math.min(i, 7) * 60}>
          <ProductCard product={p} priority={i < 4} />
        </Reveal>
      ))}
    </ul>
  );
}

const DEMO_OPTIONS: ProductOption[][] = [
  [{ name: "Size", values: ["6", "7", "8"] }, { name: "Colour", values: ["Gold", "Silver"] }],
  [{ name: "Colour", values: ["Gold", "Silver", "Rose Gold"] }],
];

function withDemoVariants(product: Product, which: number): Product {
  const options = DEMO_OPTIONS[which % DEMO_OPTIONS.length]!;
  const variants = combinations(options).map((combo, index) => ({
    id: `demo-${product.id}-${index}`,
    title: Object.values(combo).join(" / "),
    options: combo,
    sku: null,
    price: index === 0 ? null : product.price + index * 100,
    compare_at_price: null,
    stock_quantity: index === 1 ? 0 : null,
    image_url: null,
    sort_order: index,
  }));
  return { ...product, options, product_variants: variants };
}
