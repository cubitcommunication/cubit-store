import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Instagram, Play, Volume2, VolumeX } from "lucide-react";
import { formatPrice, brand } from "@/config/brand";
import { productsQuery, primaryImage, type Product } from "@/lib/catalog";
import { reelsQuery, safeLink, useReelsLayout, type Reel } from "@/lib/reels";
import { useContactInfo, useSiteText } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import { OptionalSiteBanner } from "./SiteImage";

/** How long a reel stays in front before the row moves on by itself (ms). */
const AUTO_MS = 30_000;

// One reel on a phone keeps the old look (82% wide, so the next reel peeks in); otherwise each slide is an equal share of the row; how many fit is set per screen size in Admin → Reels (phone, tablet, desktop).
const slide = "min-w-0 shrink-0 grow-0 basis-[var(--reels-m)] pl-3 sm:basis-[calc(100%/var(--reels-t))] sm:pl-4 lg:basis-[calc(100%/var(--reels-d))]";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function ReelCard({ reel, product }: { reel: Reel; product: Product | undefined }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const reduced = useRef(prefersReducedMotion());

  // Only the reel that is mostly on screen plays; the rest pause (saves data and battery).
  useEffect(() => {
    const el = box.current;
    const v = video.current;
    if (!el || !v || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !reduced.current) void v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const href = product ? `/product/${product.slug}` : safeLink(reel.link_url);
  const thumb = product ? primaryImage(product)?.image_url : null;
  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (v.paused) void v.play().catch(() => undefined);
  };
  const togglePlay = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  const cta = reel.link_label || "Shop this piece";
  const ctaClass =
    "flex h-11 w-full items-center justify-center rounded-full bg-foreground px-4 text-[0.72rem] font-semibold uppercase leading-none tracking-[0.08em] text-background transition-colors hover:bg-brand-red";

  // The video stays clean; the title, product and button sit underneath it, never on top.
  return (
    <div className="flex h-full w-full flex-col">
      <div ref={box} className="group relative isolate aspect-[9/16] w-full overflow-hidden rounded-[12px] bg-foreground">
        <video
          ref={video}
          src={reel.video_url}
          poster={reel.poster_url ?? undefined}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          aria-label={reel.title || `${brand.name} reel`}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={togglePlay}
          className="size-full cursor-pointer rounded-none object-cover"
        />
        {/* The red frame is drawn inside the reel (an outside ring is cut off by the carousel) and follows its rounded corners. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 rounded-[12px] ring-2 ring-inset ring-brand-red opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {!playing ? (
          <button type="button" onClick={togglePlay} aria-label="Play reel" className="absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <Play className="size-6 translate-x-0.5 fill-current" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
        >
          {muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
        </button>
      </div>

      <div className="flex flex-1 flex-col pt-3.5">
        {reel.title ? <p className="line-clamp-2 font-display text-[0.95rem] leading-snug tracking-tight">{reel.title}</p> : null}
        {product ? (
          <div className="mt-2.5 flex items-center gap-2.5 rounded-[12px] border border-border p-2">
            {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" className="size-11 shrink-0 rounded-[8px] object-cover" /> : null}
            <div className="min-w-0">
              <p className="break-words text-[0.8125rem] font-medium">{product.name}</p>
              <p className="text-[0.8125rem] text-muted-foreground">{formatPrice(product.price)}</p>
            </div>
          </div>
        ) : null}
        {href ? (
          <div className="mt-auto pt-3">
            {href.startsWith("/") ? (
              <Link to={href as "/"} className={ctaClass}>{cta}</Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener" className={ctaClass}>{cta}</a>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Home page "Follow our journey": reels the owner uploads in Admin → Reels, each with a
 * link to a product. One reel at a time on phones (moves on by itself every 30 seconds),
 * more on tablets and desktops. Falls back to a simple Instagram call-out when there are none.
 */
export function ReelsSection() {
  const t = useSiteText();
  const contact = useContactInfo();
  const reels = useQuery(reelsQuery());
  const layout = useReelsLayout();
  const products = useQuery(productsQuery());
  const list = reels.data ?? [];

  const [viewport, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: false });
  const [index, setIndex] = useState(0);
  const [snaps, setSnaps] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const paused = useRef(false);

  const sync = useCallback(() => {
    if (!api) return;
    setIndex(api.selectedScrollSnap());
    setSnaps(api.scrollSnapList().length);
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    sync();
    api.on("select", sync).on("reInit", sync).on("resize", sync);
    const hold = () => { paused.current = true; };
    const release = () => { paused.current = false; };
    api.on("pointerDown", hold).on("pointerUp", release);
    return () => {
      api.off("select", sync).off("reInit", sync).off("resize", sync).off("pointerDown", hold).off("pointerUp", release);
    };
  }, [api, sync]);

  // Move on every 30 s (back to the first reel after the last). Pauses while the tab is hidden
  // or the visitor is touching/hovering the row, and never runs for people who asked for less motion.
  useEffect(() => {
    if (!api || list.length < 2 || prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      if (document.hidden || paused.current) return;
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    }, AUTO_MS);
    return () => window.clearInterval(timer);
  }, [api, list.length]);

  const byId = new Map((products.data ?? []).map((p) => [p.id, p]));

  const follow = (
    <a href={contact.instagramUrl} target="_blank" rel="noreferrer noopener" className="eyebrow inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-background transition-colors hover:bg-brand-red">
      <Instagram className="size-4" /> {contact.instagramHandle}
    </a>
  );

  if (!list.length) {
    return (
      <section className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:mt-28 lg:px-10">
        <Reveal className="rounded-[12px] border border-border px-6 py-14 text-center sm:px-10">
          <OptionalSiteBanner mediaKey="instagram_section" wrapperClassName="mx-auto mb-10 max-w-3xl overflow-hidden rounded-[12px] bg-muted" />
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">{t("instagram_heading")}</h2>
          <p className="mt-4 text-sm text-muted-foreground">{t("instagram_body")}</p>
          <div className="mt-7">{follow}</div>
        </Reveal>
      </section>
    );
  }

  const arrow = (dir: "prev" | "next") => {
    const enabled = dir === "prev" ? canPrev : canNext;
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        aria-label={dir === "prev" ? "Previous reel" : "Next reel"}
        disabled={!enabled}
        onClick={() => (dir === "prev" ? api?.scrollPrev() : api?.scrollNext())}
        className={cn(
          "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-md transition-all hover:border-brand-red hover:bg-brand-red hover:text-background md:flex",
          dir === "prev" ? "left-2 lg:-left-3" : "right-2 lg:-right-3",
          !enabled && "pointer-events-none opacity-0",
        )}
      >
        <Icon className="size-5" />
      </button>
    );
  };

  return (
    <section className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:mt-28 lg:px-10" aria-labelledby="reels-heading">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow text-brand-red">{contact.instagramHandle}</p>
          <h2 id="reels-heading" className="mt-3 font-display text-3xl tracking-tight sm:text-4xl">{t("instagram_heading")}</h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">{t("instagram_body")}</p>
        </div>
        <div className="hidden sm:block">{follow}</div>
      </div>

      <div
        className="relative mt-8"
        role="region"
        aria-roledescription="carousel"
        aria-label={`${brand.name} reels`}
        onMouseEnter={() => { paused.current = true; }}
        onMouseLeave={() => { paused.current = false; }}
      >
        <div ref={viewport} className="overflow-hidden">
          <ul className="-ml-3 flex touch-pan-y sm:-ml-4" style={{ "--reels-m": layout.mobile === 1 ? "82%" : `${100 / layout.mobile}%`, "--reels-t": layout.tablet, "--reels-d": layout.desktop } as React.CSSProperties}>
            {list.map((reel) => (
              <li key={reel.id} className={`${slide} flex`} aria-roledescription="slide">
                <ReelCard reel={reel} product={reel.product_id ? byId.get(reel.product_id) : undefined} />
              </li>
            ))}
          </ul>
        </div>
        {arrow("prev")}
        {arrow("next")}
      </div>

      {snaps > 1 ? (
        <div className="mt-5 flex justify-center gap-2" role="tablist" aria-label="Choose reel">
          {Array.from({ length: snaps }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Reel ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className={cn("h-2 rounded-full transition-all", i === index ? "w-6 bg-brand-red" : "w-2 bg-foreground/25 hover:bg-foreground/50")}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-6 text-center sm:hidden">{follow}</div>
    </section>
  );
}
