import { brand } from "@/config/brand";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery, productsQuery, safeImage, slugRedirectQuery } from "@/lib/catalog";
import { ProductGrid } from "@/components/site/ProductGrid";
import { Reveal } from "@/components/site/Reveal";
import { PageBlocks } from "@/components/site/PageBlocks";
import { CollectionProvider } from "@/components/site/TemplateBlocks";
import { systemPageQuery } from "@/lib/pages";
import { useSystemPage } from "@/lib/system-page";
import { breadcrumbJsonLd, pageMeta, seoDescription } from "@/lib/seo";

export const Route = createFileRoute("/category/$slug")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(systemPageQuery("collection")).catch(() => null);
    const [categories, products] = await Promise.all([
      context.queryClient.ensureQueryData(categoriesQuery()),
      context.queryClient.ensureQueryData(productsQuery()),
    ]);
    const category = categories.find((item) => item.slug === params.slug);
    if (!category) {
      const target = await context.queryClient.ensureQueryData(slugRedirectQuery(`/category/${params.slug}`));
      if (target) throw redirect({ href: target, statusCode: 301 });
      throw notFound();
    }
    const matches = products.filter((product) => product.category.toLowerCase() === category.name.toLowerCase());
    if (!matches.length) throw notFound();
    return { category, products: matches };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) return pageMeta({ path: `/category/${params.slug}`, title: `Category unavailable — ${brand.name}`, description: `This ${brand.name} category is unavailable.`, noindex: true });
    const { category } = loaderData;
    const title = category.seo_title?.trim() || `${category.name} — ${brand.name}`;
    const description = seoDescription(category.seo_description ?? "", category.description ?? `Explore ${brand.name} ${category.name.toLowerCase()} and enquire directly on WhatsApp.`);
    const base = pageMeta({ path: `/category/${category.slug}`, title, description, image: category.seo_image_url || category.image });
    return { ...base, scripts: [{ type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }, { name: category.name, path: `/category/${category.slug}` }])) }] };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category, products } = Route.useLoaderData();
  const image = safeImage(category.image);
  const template = useSystemPage("collection");
  if (template) {
    return (
      <CollectionProvider
        value={{
          name: category.name,
          description: category.description ?? null,
          image: category.image ?? null,
          products,
          isLoading: false,
          isError: false,
          onRetry: () => undefined,
          parent: { label: "Shop", to: "/shop" },
          heightClass: "h-[40vh] min-h-[280px]",
        }}
      >
        <div className="pb-24"><PageBlocks blocks={template} /></div>
      </CollectionProvider>
    );
  }
  return <div className="pb-24">
    <Reveal as="header" className="relative">
      <div className="relative h-[40vh] min-h-[280px] overflow-hidden bg-foreground">
        {image ? <img src={image} alt={`${category.name} by ${brand.name}`} className="size-full object-cover opacity-75" decoding="async" /> : null}
        <div className="absolute inset-0 flex items-end bg-foreground/35"><div className="mx-auto w-full max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-10">
          <nav aria-label="Breadcrumb" className="eyebrow text-background/70"><Link to="/shop" className="hover:text-background">Shop</Link><span aria-hidden="true"> / </span><span className="text-background">{category.name}</span></nav>
          <h1 className="mt-4 font-display text-4xl tracking-tight text-background sm:text-6xl">{category.name.toUpperCase()}</h1>
        </div></div>
      </div>
    </Reveal>
    <div className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 lg:px-10">
      {category.description ? <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{category.description}</p> : null}
      <p className="eyebrow mt-6 text-muted-foreground">{products.length} pieces</p>
      <div className="mt-10"><ProductGrid products={products} /></div>
    </div>
  </div>;
}