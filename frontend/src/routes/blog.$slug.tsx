import { brand } from "@/config/brand";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageBlocks } from "@/components/site/PageBlocks";
import { Reveal } from "@/components/site/Reveal";
import { safeImage } from "@/lib/catalog";
import { blogListQuery, parseTags, publishedPostQuery } from "@/lib/pages";
import { absoluteUrl, breadcrumbJsonLd, pageMeta, seoDescription } from "@/lib/seo";
import { PostTile, postDate } from "@/routes/blog.index";

/** One blog post (Admin -> Blog posts). A draft or unknown address is a 404. */
export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ context, params }) => {
    const post = await context.queryClient.ensureQueryData(publishedPostQuery(params.slug));
    if (!post) throw notFound();
    return { post };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) return pageMeta({ path: `/blog/${params.slug}`, title: `Post not found — ${brand.name}`, description: `This ${brand.name} post could not be found.`, noindex: true });
    const { post } = loaderData;
    const image = post.seo_image_url || post.cover_url;
    const description = seoDescription(post.seo_description || post.excerpt || "", `${post.title} — from the ${brand.name} journal.`);
    const base = pageMeta({ path: `/blog/${post.slug}`, title: post.seo_title?.trim() || `${post.title} — ${brand.name}`, description, image, type: "article" });
    return {
      ...base,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description,
            url: absoluteUrl(`/blog/${post.slug}`),
            ...(image ? { image: absoluteUrl(image) } : {}),
            ...(post.published_at ? { datePublished: post.published_at.replace(" ", "T") + "Z" } : {}),
            ...(post.author ? { author: { "@type": "Person", name: post.author } } : {}),
            publisher: { "@type": "Organization", name: brand.name },
          }),
        },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Journal", path: "/blog" }, { name: post.title, path: `/blog/${post.slug}` }])) },
      ],
    };
  },
  component: PostPage,
});

function PostPage() {
  const { post } = Route.useLoaderData();
  const { data } = useQuery(blogListQuery());
  const more = (data ?? []).filter((p) => p.id !== post.id).slice(0, 3);
  const cover = safeImage(post.cover_url);
  const tags = parseTags(post.tags);

  return (
    <article className="pb-24">
      <Reveal as="header" className="mx-auto max-w-3xl px-4 pt-12 text-center sm:px-6 lg:pt-20">
        <nav aria-label="Breadcrumb" className="eyebrow text-muted-foreground">
          <Link to="/blog" className="hover:text-brand-red">Journal</Link>
        </nav>
        {tags.length ? <p className="eyebrow mt-5 text-brand-red">{tags.join(" · ")}</p> : null}
        <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">{post.title}</h1>
        <p className="mt-5 text-sm text-muted-foreground">{[postDate(post), post.author].filter(Boolean).join(" · ")}</p>
      </Reveal>

      {cover ? (
        <div className="mx-auto mt-10 max-w-[1100px] px-4 sm:px-6">
          <img src={cover} alt="" decoding="async" className="max-h-[560px] w-full object-cover" />
        </div>
      ) : null}

      <div className="mt-6">
        <PageBlocks blocks={post.blocks ?? []} />
      </div>

      {more.length ? (
        <section className="mx-auto mt-16 max-w-[1400px] px-4 sm:px-6 lg:mt-24 lg:px-10">
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">MORE FROM THE JOURNAL</h2>
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((p) => <PostTile key={p.id} post={p} />)}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
