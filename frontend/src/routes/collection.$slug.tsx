import { brand } from "@/config/brand";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  collectionsQuery,
  matchesCollection,
  productsQuery,
  safeImage,
  slugRedirectQuery,
} from "@/lib/catalog";
import { CollectionProducts } from "@/components/site/CollectionProducts";
import { Reveal } from "@/components/site/Reveal";
import { PageBlocks } from "@/components/site/PageBlocks";
import { CollectionProvider } from "@/components/site/TemplateBlocks";
import { systemPageQuery } from "@/lib/pages";
import { useSystemPage } from "@/lib/system-page";
import { breadcrumbJsonLd, pageMeta, seoDescription } from "@/lib/seo";

export const Route = createFileRoute("/collection/$slug")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(systemPageQuery("collection")).catch(() => null);
    const collections = await context.queryClient.ensureQueryData(collectionsQuery());
    const collection = collections.find((c) => c.slug === params.slug);
    if (!collection) {
      const target = await context.queryClient.ensureQueryData(slugRedirectQuery(`/collection/${params.slug}`));
      if (target) throw redirect({ href: target, statusCode: 301 });
      throw notFound();
    }
    return { collection };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return pageMeta({ path: `/collection/${params.slug}`, title: `Collection unavailable — ${brand.name}`, description: `This ${brand.name} collection is unavailable.`, noindex: true });
    }
    const { collection } = loaderData;
    const title = collection.seo_title?.trim() || `${collection.name} — ${brand.name}`;
    const description = seoDescription(collection.seo_description ?? "", collection.description ?? `Explore the ${collection.name} collection by ${brand.name}.`);
    const base = pageMeta({ path: `/collection/${collection.slug}`, title, description, image: collection.seo_image_url || collection.image });
    return {
      ...base,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Collections", path: "/collections" }, { name: collection.name, path: `/collection/${collection.slug}` }])),
        },
      ],
    };
  },
  component: CollectionPage,
});

function CollectionPage() {
  const { collection } = Route.useLoaderData();
  const { data, isLoading, isError, refetch } = useQuery(productsQuery());
  const products = (data ?? []).filter((p) => matchesCollection(p, collection));
  const image = safeImage(collection.image);
  const template = useSystemPage("collection");

  if (template) {
    return (
      <CollectionProvider
        value={{
          name: collection.name,
          description: collection.description ?? null,
          image: collection.image ?? null,
          products,
          isLoading,
          isError,
          onRetry: () => void refetch(),
          parent: { label: "Collections", to: "/collections" },
          heightClass: "h-[46vh] min-h-[300px]",
        }}
      >
        <div className="pb-24"><PageBlocks blocks={template} /></div>
      </CollectionProvider>
    );
  }

  return (
    <div className="pb-24">
      <Reveal as="header" className="relative">
        <div className="relative h-[46vh] min-h-[300px] w-full overflow-hidden bg-foreground">
          {image ? (
            <img
              src={image}
              alt={`${collection.name} by ${brand.name}`}
              className="size-full object-cover opacity-80"
              decoding="async"
            />
          ) : null}
          <div className="absolute inset-0 flex items-end bg-foreground/35">
            <div className="mx-auto w-full max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-10 lg:pb-14">
              <nav aria-label="Breadcrumb" className="eyebrow text-background/70">
                <Link to="/collections" className="hover:text-background">
                  Collections
                </Link>
                <span aria-hidden="true"> / </span>
                <span className="text-background">{collection.name}</span>
              </nav>
              <h1 className="mt-4 max-w-3xl font-display text-3xl leading-[1.03] tracking-tight text-background sm:text-5xl lg:text-6xl">
                {collection.name.toUpperCase()}
              </h1>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 lg:px-10 lg:pt-14">
        {collection.description ? (
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {collection.description}
          </p>
        ) : null}
        <div className="mt-8">
          <CollectionProducts products={products} isLoading={isLoading} isError={isError} onRetry={() => refetch()} />
        </div>
      </div>
    </div>
  );
}
