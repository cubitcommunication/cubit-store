import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { productQuery, productsQuery, relatedProducts, primaryImage, slugRedirectQuery } from "@/lib/catalog";
import { formatPrice, brand } from "@/config/brand";
import { ProductGallery } from "@/components/site/ProductGallery";
import { ProductGrid } from "@/components/site/ProductGrid";
import { PageBlocks } from "@/components/site/PageBlocks";
import { Details, ProductBreadcrumbBlock, ProductProvider, ProductStickyBar, useProductCtx } from "@/components/site/TemplateBlocks";
import { systemPageQuery } from "@/lib/pages";
import { useSystemPage } from "@/lib/system-page";
import { absoluteUrl, breadcrumbJsonLd, pageMeta, seoDescription } from "@/lib/seo";

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ context, params }) => {
    const [product] = await Promise.all([
      context.queryClient.ensureQueryData(productQuery(params.slug)),
      context.queryClient.ensureQueryData(systemPageQuery("product")).catch(() => null),
    ]);
    if (!product) {
      const target = await context.queryClient.ensureQueryData(slugRedirectQuery(`/product/${params.slug}`));
      if (target) throw redirect({ href: target, statusCode: 301 });
      throw notFound();
    }
    return { product };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return pageMeta({
        path: `/product/${params.slug}`,
        title: `Piece unavailable — ${brand.name}`,
        description: `This ${brand.name} piece is unavailable.`,
        noindex: true,
      });
    }
    const p = loaderData.product;
    const title = p.seo_title?.trim() || `${p.name} — ${formatPrice(p.price)} | ${brand.name}`;
    const description = seoDescription(
      p.seo_description ?? "",
      p.description ?? `${p.name}, ${p.material} ${p.category} by ${brand.name}. SKU ${p.sku}.`,
    );
    const image = p.seo_image_url || primaryImage(p)?.image_url || null;
    const base = pageMeta({ path: `/product/${p.slug}`, title, description, image, type: "product" });
    return {
      ...base,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            sku: p.sku,
            description: description,
            material: p.material,
            category: p.category,
            brand: { "@type": "Brand", name: brand.name },
            url: absoluteUrl(`/product/${p.slug}`),
            ...(image ? { image: absoluteUrl(image) } : {}),
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Shop", path: "/shop" },
              { name: p.name, path: `/product/${p.slug}` },
            ]),
          ),
        },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData();
  return (
    <ProductProvider product={product}>
      <ProductView />
    </ProductProvider>
  );
}

function ProductView() {
  const ctx = useProductCtx()!;
  const { product, selection, setSelection, variant, needOptions } = ctx;
  const template = useSystemPage("product");
  const { data: all } = useQuery(productsQuery());
  const related = all ? relatedProducts(all, product) : [];

  if (template) {
    return (
      <div className="pb-32 lg:pb-24">
        <PageBlocks blocks={template} />
      </div>
    );
  }

  return (
    <div className="pb-32 lg:pb-24">
      <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        <ProductBreadcrumbBlock />

        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <ProductGallery product={product} focusUrl={variant?.image_url ?? null} focusVideo={variant?.video_url ?? null} />
          <Details product={product} selection={selection} onSelect={setSelection} onNeedOptions={needOptions} />
        </div>
      </div>

      {related.length ? (
        <section className="product-cat-main mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:mt-28 lg:px-10">
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">YOU MAY ALSO LIKE</h2>
          <div className="mt-8">
            <ProductGrid products={related} />
          </div>
        </section>
      ) : null}

      <ProductStickyBar />
    </div>
  );
}
