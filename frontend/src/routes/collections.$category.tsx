import { brand } from "@/config/brand";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { categoriesQuery, collectionsQuery, safeImage } from "@/lib/catalog";
import { collectionsForCategory } from "@/lib/category-nav";
import { Reveal } from "@/components/site/Reveal";
import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { breadcrumbJsonLd, pageMeta, seoDescription } from "@/lib/seo";

/**
 * Parent category page.
 *
 * Sub-collections are discovered from the database, so any collection added in
 * the admin panel under this category appears here automatically.
 */
export const Route = createFileRoute("/collections/$category")({
  loader: async ({ context, params }) => {
    const [categories, collections] = await Promise.all([
      context.queryClient.ensureQueryData(categoriesQuery()),
      context.queryClient.ensureQueryData(collectionsQuery()),
    ]);
    const category = categories.find((c) => c.slug === params.category);
    if (!category) throw notFound();
    return { category, collections: collectionsForCategory(collections, category.name) };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData)
      return pageMeta({
        path: `/collections/${params.category}`,
        title: `Category unavailable — ${brand.name}`,
        description: `This ${brand.name} category is unavailable.`,
        noindex: true,
      });
    const { category } = loaderData;
    const title = category.seo_title?.trim() || `${category.name} Collections — ${brand.name}`;
    const description = seoDescription(
      category.seo_description ?? "",
      category.description ??
        `Browse every ${brand.name} ${category.name.toLowerCase()} collection and find your piece faster.`,
    );
    const base = pageMeta({
      path: `/collections/${category.slug}`,
      title,
      description,
      image: category.seo_image_url || category.image,
    });
    return {
      ...base,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Collections", path: "/collections" },
              { name: category.name, path: `/collections/${category.slug}` },
            ]),
          ),
        },
      ],
    };
  },
  component: ParentCategoryPage,
});

function ParentCategoryPage() {
  const { category, collections } = Route.useLoaderData();

  return (
    <div className="product-cat-main mx-auto max-w-[1400px] px-4 pb-24 pt-12 sm:px-6 lg:px-10 lg:pt-20">
      <Reveal as="header">
        <nav aria-label="Breadcrumb" className="eyebrow text-muted-foreground">
          <Link to="/collections" className="hover:text-brand-red">
            Collections
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">{category.name}</span>
        </nav>
        <h1 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          {category.name.toUpperCase()}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {category.description ??
            `Choose a ${category.name.toLowerCase()} edit below to see the pieces in it.`}
        </p>
        <Link
          to="/category/$slug"
          params={{ slug: category.slug }}
          className="eyebrow mt-6 inline-block border-b border-foreground pb-0.5 hover:text-brand-red"
        >
          View all {category.name.toLowerCase()}
        </Link>
      </Reveal>

      {collections.length === 0 ? (
        <p className="mt-16 border border-border px-6 py-16 text-center text-sm text-muted-foreground">
          These collections are being updated. Please check back soon.
        </p>
      ) : (
        <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:mt-16 lg:grid-cols-4">
          {collections.map((c, i) => {
            const img = safeImage(c.image);
            return (
              <Reveal as="li" key={c.id} delay={Math.min(i, 5) * 60} className="min-w-0">
                <Link
                  to="/collection/$slug"
                  params={{ slug: c.slug }}
                  className="group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-red"
                >
                  <div className="isolate overflow-hidden rounded-[12px] bg-muted">
                    <div className="aspect-[4/5]">
                      {img ? (
                        <img
                          src={img}
                          alt={`${c.name} collection by ${brand.name}`}
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                        />
                      ) : (
                        <LogoPlaceholder className="size-full" />
                      )}
                    </div>
                  </div>
                  <h2 className="mt-4 font-display text-lg leading-snug tracking-tight transition-colors group-hover:text-brand-red">
                    {c.name}
                  </h2>
                  {c.description ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {c.description}
                    </p>
                  ) : null}
                </Link>
              </Reveal>
            );
          })}
        </ul>
      )}
    </div>
  );
}
