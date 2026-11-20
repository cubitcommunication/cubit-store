import { brand } from "@/config/brand";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { PageBlocks } from "@/components/site/PageBlocks";
import { publishedPolicyQuery } from "@/lib/pages";
import { breadcrumbJsonLd, pageMeta, seoDescription } from "@/lib/seo";

/** A policy page made in Admin → Policies (terms, privacy, refunds, shipping). Only published ones exist for visitors. */
export const Route = createFileRoute("/policies/$slug")({
  loader: async ({ context, params }) => {
    const page = await context.queryClient.ensureQueryData(publishedPolicyQuery(params.slug));
    if (!page) throw notFound();
    return { page };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return pageMeta({ path: `/policies/${params.slug}`, title: `Page not found — ${brand.name}`, description: `This ${brand.name} page could not be found.`, noindex: true });
    }
    const { page } = loaderData;
    const base = pageMeta({
      path: `/policies/${page.slug}`,
      title: page.seo_title?.trim() || `${page.title} — ${brand.name}`,
      description: seoDescription(page.seo_description ?? "", `${page.title} of ${brand.name}.`),
    });
    return {
      ...base,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: page.title, path: `/policies/${page.slug}` }])),
        },
      ],
    };
  },
  component: PolicyPage,
});

function PolicyPage() {
  const { page } = Route.useLoaderData();
  return (
    // Section titles are smaller than on marketing pages: a policy is long reading, not a banner.
    <div className="pb-24 [&_h2]:text-2xl sm:[&_h2]:text-3xl">
      <h1 className="sr-only">{page.title}</h1>
      <PageBlocks blocks={page.blocks ?? []} />
    </div>
  );
}
