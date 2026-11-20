import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ShopListing } from "@/components/site/ListingBlocks";
import { OptionalSiteBanner } from "@/components/site/SiteImage";
import { PageBlocks } from "@/components/site/PageBlocks";
import { systemPageQuery } from "@/lib/pages";
import { useSystemPage } from "@/lib/system-page";
import { pageMeta } from "@/lib/seo";

type Search = { q?: string | undefined };

export const Route = createFileRoute("/shop")({
  loader: ({ context }) => context.queryClient.ensureQueryData(systemPageQuery("shop")).catch(() => null),
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search["q"] === "string" ? (search["q"] as string).slice(0, 80) || undefined : undefined,
  }),
  head: ({ match }) =>
    pageMeta({
      path: "/shop",
      title: `Shop — ${brand.name}`,
      description:
        `Browse everything from ${brand.name} by category and price. View product details and enquire directly on WhatsApp.`,
      noindex: Boolean((match.search as Search).q),
    }),
  component: ShopPage,
});

function ShopPage() {
  const template = useSystemPage("shop");
  if (template) return <div className="pb-24"><PageBlocks blocks={template} /></div>;
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-12 sm:px-6 lg:px-10 lg:pt-20">
        <OptionalSiteBanner mediaKey="shop_banner" wrapperClassName="mb-10 overflow-hidden bg-muted" />
        <Reveal as="header">
          <p className="eyebrow text-brand-red">The full range</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">SHOP {brand.name}</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every published piece, ready to browse. Found something you love? Send a WhatsApp enquiry and we'll take it from there.
          </p>
        </Reveal>
      </div>
      <ShopListing />
    </>
  );
}
