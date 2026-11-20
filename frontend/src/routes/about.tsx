import { createFileRoute } from "@tanstack/react-router";
import { PageBlocks } from "@/components/site/PageBlocks";
import { brand } from "@/config/brand";
import { DEFAULT_BLOCKS } from "@/lib/page-defaults";
import { systemPageQuery } from "@/lib/pages";
import { pageMeta } from "@/lib/seo";
import { useSystemPage } from "@/lib/system-page";

export const Route = createFileRoute("/about")({
  loader: ({ context }) => context.queryClient.ensureQueryData(systemPageQuery("about")).catch(() => null),
  head: () => pageMeta({ path: "/about", title: `About ${brand.name}`, description: brand.tagline || `Learn more about ${brand.name}.` }),
  component: AboutPage,
});

/** The About page is built in Admin → Pages → About page; until it is published, a simple starting design is shown. */
function AboutPage() {
  const blocks = useSystemPage("about") ?? DEFAULT_BLOCKS.about();
  return <div className="pb-24"><PageBlocks blocks={blocks} /></div>;
}
