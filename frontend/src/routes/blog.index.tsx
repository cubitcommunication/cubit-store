import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { BlogList } from "@/components/site/ListingBlocks";
import { PageBlocks } from "@/components/site/PageBlocks";
import { blogListQuery, systemPageQuery } from "@/lib/pages";
import { useSystemPage } from "@/lib/system-page";
import { Reveal } from "@/components/site/Reveal";
import { breadcrumbJsonLd, pageMeta } from "@/lib/seo";

/** The blog list (Admin -> Blog posts). Only published posts exist for visitors. */
export const Route = createFileRoute("/blog/")({
  validateSearch: (s: Record<string, unknown>): { tag?: string | undefined } => ({ tag: typeof s["tag"] === "string" && s["tag"].trim() ? s["tag"].trim().slice(0, 40) : undefined }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(blogListQuery()).catch(() => []), context.queryClient.ensureQueryData(systemPageQuery("blog")).catch(() => null)]),
  head: () => {
    const base = pageMeta({ path: "/blog", title: `Journal — ${brand.name}`, description: `News, ideas and updates from ${brand.name}.` });
    return { ...base, scripts: [{ type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Journal", path: "/blog" }])) }] };
  },
  component: BlogIndex,
});

export { PostTile, postDate } from "@/components/site/ListingBlocks";

function BlogIndex() {
  const template = useSystemPage("blog");
  if (template) return <div className="pb-24"><PageBlocks blocks={template} /></div>;
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-12 sm:px-6 lg:px-10 lg:pt-20">
        <Reveal as="header">
          <p className="eyebrow text-brand-red">Stories & styling</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">JOURNAL</h1>
        </Reveal>
        <div className="mt-8" />
      </div>
      <BlogList />
    </>
  );
}
