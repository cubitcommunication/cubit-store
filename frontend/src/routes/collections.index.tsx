import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { CollectionsList } from "@/components/site/ListingBlocks";
import { Reveal } from "@/components/site/Reveal";
import { OptionalSiteBanner } from "@/components/site/SiteImage";
import { PageBlocks } from "@/components/site/PageBlocks";
import { systemPageQuery } from "@/lib/pages";
import { useSystemPage } from "@/lib/system-page";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/collections/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(systemPageQuery("collections")).catch(() => null),
  head: () =>
    pageMeta({
      path: "/collections",
      title: `Collections — ${brand.name}`,
      description:
        `Explore the ${brand.name} collections.`,
    }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const template = useSystemPage("collections");
  if (template) return <div className="pb-24"><PageBlocks blocks={template} /></div>;
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-12 sm:px-6 lg:px-10 lg:pt-20">
        <OptionalSiteBanner mediaKey="collections_banner" wrapperClassName="mb-10 overflow-hidden bg-muted" />
        <Reveal as="header" className="mb-8">
          <p className="eyebrow text-brand-red">Curated edits</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">COLLECTIONS</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Browse the collections to find what you are looking for faster.
          </p>
        </Reveal>
      </div>
      <CollectionsList />
    </>
  );
}
