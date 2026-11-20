import { brand } from "@/config/brand";

export const SITE_URL = brand.siteUrl;
export const SITE_NAME = brand.name;

export function absoluteUrl(path = "/"): string {
  if (/^https:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function seoDescription(value: string, fallback: string): string {
  return (value.trim() || fallback).replace(/\s+/g, " ").slice(0, 158);
}

export function pageMeta(input: {
  path: string;
  title: string;
  description: string;
  image?: string | null;
  type?: "website" | "product" | "article";
  noindex?: boolean;
}) {
  const url = absoluteUrl(input.path);
  const image = input.image ? absoluteUrl(input.image) : null;
  return {
    meta: [
      { title: input.title },
      { name: "description", content: input.description },
      { name: "robots", content: input.noindex ? "noindex, follow" : "index, follow" },
      { property: "og:title", content: input.title },
      { property: "og:description", content: input.description },
      { property: "og:type", content: input.type ?? "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: input.title },
      { name: "twitter:description", content: input.description },
      ...(image
        ? [
            { property: "og:image", content: image },
            { name: "twitter:image", content: image },
          ]
        : []),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}