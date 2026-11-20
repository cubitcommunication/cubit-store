import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HOME_TEMPLATES } from "@/lib/home-templates";
import { PREMIUM_TYPES, isPremiumType, premiumBlank, type PremiumBlock } from "@/lib/premium-blocks";

// The router and the site-picture lookup need a running app; for drawing tests plain stand-ins are enough.
vi.mock("@/components/site/SmartLink", () => ({
  SmartLink: ({ href, children, className }: { href: string; children?: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock("@/lib/site-media", () => ({ useSiteMedia: () => ({ src: null, mobileSrc: null, alt: "" }) }));
vi.mock("@/components/site/LogoPlaceholder", () => ({ LogoPlaceholder: () => <div data-placeholder="" /> }));

import { PremiumBlockView } from "@/components/site/PremiumBlocks";

const draw = (block: PremiumBlock) => {
  const client = new QueryClient();
  return renderToString(<QueryClientProvider client={client}><PremiumBlockView block={block} /></QueryClientProvider>);
};

describe("premium elements draw", () => {
  it("every element draws with its starting content, without errors", () => {
    for (const type of PREMIUM_TYPES) {
      expect(() => draw(premiumBlank(type)), type).not.toThrow();
    }
  });

  it("tolerates missing or odd content (an empty list, wrong types, nothing at all)", () => {
    for (const type of PREMIUM_TYPES) {
      expect(() => draw({ id: "x", type, props: {} }), `${type} with no content`).not.toThrow();
      expect(() => draw({ id: "x", type, props: { items: null, tabs: "no", plans: 5, heading: 12, image: {} } }), `${type} with odd content`).not.toThrow();
    }
  });

  it("shows what was typed, as plain text", () => {
    const html = draw(premiumBlank("p_hero_centered", { heading: "<script>alert(1)</script> Big sale" }));
    expect(html).toContain("Big sale");
    expect(html).not.toContain("<script>alert(1)");
  });

  it("a map is shown only for a Google Maps embed address", () => {
    const bad = draw(premiumBlank("p_map", { embed: "https://evil.example/frame" }));
    const good = draw(premiumBlank("p_map", { embed: "https://www.google.com/maps/embed?pb=abc" }));
    expect(bad).not.toContain("<iframe");
    expect(good).toContain("<iframe");
  });

  it("all five templates draw completely", () => {
    for (const t of HOME_TEMPLATES) {
      for (const b of t.build()) {
        if (isPremiumType(b.type)) expect(() => draw(b as unknown as PremiumBlock), `${t.id}/${b.type}`).not.toThrow();
      }
    }
  });
});
