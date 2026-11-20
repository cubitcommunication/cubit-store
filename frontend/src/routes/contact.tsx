import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { PageBlocks } from "@/components/site/PageBlocks";
import { ContactBody } from "@/components/site/SiteBlocks";
import { Reveal } from "@/components/site/Reveal";
import { systemPageQuery } from "@/lib/pages";
import { useSystemPage } from "@/lib/system-page";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/contact")({
  loader: ({ context }) => context.queryClient.ensureQueryData(systemPageQuery("contact")).catch(() => null),
  head: () => pageMeta({ path: "/contact", title: `Contact ${brand.name} — Enquire on WhatsApp`, description: `Contact ${brand.name} by WhatsApp, phone, e-mail or social media.` }),
  component: ContactPage,
});

function ContactPage() {
  const template = useSystemPage("contact");
  if (template) return <div className="pb-24"><PageBlocks blocks={template} /></div>;
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 sm:px-6 lg:px-10 lg:pt-20">
      <Reveal as="header">
        <p className="eyebrow text-brand-red">We're one message away</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          CONTACT
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Talk to {brand.name} about availability, styling and product details. WhatsApp is
          the fastest way to reach us.
        </p>
      </Reveal>

      <div className="mt-12">
        <ContactBody />
      </div>
    </div>
  );
}
