import { brand } from "@/config/brand";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { PageBlocks } from "@/components/site/PageBlocks";
import { publishedPageQuery } from "@/lib/pages";
import { breadcrumbJsonLd, pageMeta, seoDescription } from "@/lib/seo";

/** A page made in Admin → Pages. Only published pages exist for visitors; a draft or unknown address is a 404. */
export const Route = createFileRoute("/pages/$slug")({
  loader: async ({ context, params }) => {
    const page = await context.queryClient.ensureQueryData(publishedPageQuery(params.slug));
    if (!page) throw notFound();
    return { page };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return pageMeta({ path: `/pages/${params.slug}`, title: `Page not found — ${brand.name}`, description: `This ${brand.name} page could not be found.`, noindex: true });
    }
    const { page } = loaderData;
    const base = pageMeta({
      path: `/pages/${page.slug}`,
      title: page.seo_title?.trim() || `${page.title} — ${brand.name}`,
      description: seoDescription(page.seo_description ?? "", `${page.title} by ${brand.name}.`),
      image: page.seo_image_url,
    });
    return {
      ...base,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: page.title, path: `/pages/${page.slug}` }])),
        },
      ],
    };
  },
  component: BuiltPage,
});

function BuiltPage() {
  const { page } = Route.useLoaderData();
  return (
    <div className="pb-24">
      <h1 className="sr-only">{page.title}</h1>
      <PageBlocks blocks={page.blocks ?? []} />
    </div>
  );
}
