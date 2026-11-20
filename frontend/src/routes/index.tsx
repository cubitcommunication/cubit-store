import { createFileRoute } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import { PageBlocks } from "@/components/site/PageBlocks";
import { DEFAULT_BLOCKS } from "@/lib/page-defaults";
import { systemPageQuery } from "@/lib/pages";
import { useSystemPage } from "@/lib/system-page";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(systemPageQuery("home")).catch(() => null),
  head: () => ({
    ...pageMeta({
      path: "/",
      title: brand.name,
      description:
        brand.tagline || `Shop ${brand.name} online.`,
    }),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: brand.name,
          url: brand.siteUrl,
          email: brand.email,
          telephone: `+${brand.phoneE164}`,
          sameAs: [brand.instagramUrl, brand.facebookUrl],
        }),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const blocks = useSystemPage("home") ?? DEFAULT_BLOCKS.home();
  return <div className="pb-24"><PageBlocks blocks={blocks} /></div>;
}
