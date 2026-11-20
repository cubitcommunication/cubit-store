import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, X, ZoomIn } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { cn } from "@/lib/utils";

type Img = Product["product_images"][number];

const HOVER_ZOOM = 2.6; // magnification while hovering the main image
const LIGHTBOX_ZOOM = 2.5; // magnification inside the full-screen viewer

/**
 * Product photo gallery with magnification:
 *  - Desktop: hover the main image and the area under the cursor is magnified in place.
 *  - Click / tap (or the magnifier button): full-screen viewer with zoom in/out, drag or move to pan,
 *    arrow keys / buttons to change photo, and Esc to close.
 */
type Item = { kind: "image"; img: Img } | { kind: "video"; url: string };

/** The photos first, then the product's video and any variation videos (each shown once). */
function galleryItems(product: Product): Item[] {
  const videos = [...new Set([product.video_url, ...(product.product_variants ?? []).map((v) => v.video_url)].filter((u): u is string => Boolean(u)))];
  return [...product.product_images.map((img): Item => ({ kind: "image", img })), ...videos.map((url): Item => ({ kind: "video", url }))];
}

export function ProductGallery({ product, className, focusUrl, focusVideo }: { product: Product; className?: string; focusUrl?: string | null; focusVideo?: string | null }) {
  const images = product.product_images;
  const items = galleryItems(product);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const active = items[Math.min(index, items.length - 1)];

  // Choosing a variant that has its own video (or photo) shows it.
  useEffect(() => {
    if (focusVideo) {
      const at = items.findIndex((i) => i.kind === "video" && i.url === focusVideo);
      if (at >= 0) setIndex(at);
      return;
    }
    if (!focusUrl) return;
    const at = items.findIndex((i) => i.kind === "image" && i.img.image_url === focusUrl);
    if (at >= 0) setIndex(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUrl, focusVideo, product.id]);

  if (!active) {
    return <LogoPlaceholder className={cn("aspect-[4/5] w-full rounded-xl", className)} />;
  }

  return (
    <div className={className}>
      {active.kind === "image" ? <MainImage image={active.img} name={product.name} onOpen={() => setLightbox(true)} /> : <MainVideo url={active.url} name={product.name} />}

      {items.length > 1 ? (
        <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {items.map((item, i) => (
            <li key={item.kind === "image" ? item.img.id : item.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={item.kind === "video" ? "Show the video" : `Show image ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={cn(
                  "relative block size-20 overflow-hidden rounded-xl border-2 transition-colors sm:size-24",
                  i === index ? "border-foreground" : "border-transparent opacity-80 hover:opacity-100",
                )}
              >
                {item.kind === "image" ? (
                  <img src={item.img.image_url} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <>
                    <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden="true" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white"><Play className="size-6 fill-current" /></span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {lightbox && active.kind === "image" ? (
        <Lightbox images={images} start={index} name={product.name} onChange={setIndex} onClose={() => setLightbox(false)} />
      ) : null}
    </div>
  );
}

/**
 * The product video. It always plays without sound: it is muted, has no volume control, and stays muted even if the browser
 * tries to change that. Autoplay (muted, looping) is skipped for people who asked for less motion; a tap pauses or plays it.
 */
function MainVideo({ url, name }: { url: string; name: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [playing, setPlaying] = useState(!reduced);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  return (
    <div className="group relative overflow-hidden rounded-xl bg-black">
      <video
        key={url}
        ref={video}
        src={url}
        autoPlay={!reduced}
        loop
        muted
        playsInline
        preload="metadata"
        disablePictureInPicture
        controlsList="nodownload noremoteplayback"
        aria-label={`${name} video, without sound`}
        onVolumeChange={(e) => {
          e.currentTarget.muted = true;
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
        className="aspect-[4/5] w-full cursor-pointer object-cover"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause the video" : "Play the video"}
        className="absolute bottom-3 right-3 flex size-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
      >
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 translate-x-px fill-current" />}
      </button>
    </div>
  );
}

function MainImage({ image, name, onOpen }: { image: Img; name: string; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const box = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  const move = (event: React.MouseEvent) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(100, Math.max(0, ((event.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - r.top) / r.height) * 100)),
    });
  };

  return (
    <div
      ref={box}
      className="product-main group relative cursor-zoom-in overflow-hidden rounded-xl bg-muted"
      onTouchStart={() => {
        touched.current = true; // touch devices use the tap-to-open viewer, not the hover magnifier
        setHover(false);
      }}
      onMouseEnter={(e) => {
        if (touched.current) return;
        setHover(true);
        move(e);
      }}
      onMouseMove={move}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`Open ${name} full screen and zoom`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <img
        key={image.id}
        src={image.image_url}
        alt={image.alt_text ?? name}
        className="shop-fade aspect-[4/5] w-full object-cover"
        decoding="async"
        draggable={false}
      />
      {hover ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-no-repeat"
          style={{
            backgroundImage: `url("${image.image_url}")`,
            backgroundSize: `${HOVER_ZOOM * 100}%`,
            backgroundPosition: `${pos.x}% ${pos.y}%`,
          }}
        />
      ) : null}
      <span className="pointer-events-none absolute bottom-3 right-3 flex size-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-opacity group-hover:opacity-0">
        <ZoomIn className="size-5" />
      </span>
    </div>
  );
}

function Lightbox({
  images,
  start,
  name,
  onChange,
  onClose,
}: {
  images: Img[];
  start: number;
  name: string;
  onChange: (i: number) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const pane = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const image = images[i]!;

  const go = useCallback(
    (delta: number) => {
      setZoomed(false);
      setI((cur) => {
        const next = (cur + delta + images.length) % images.length;
        onChange(next);
        return next;
      });
    },
    [images.length, onChange],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "+" || e.key === "=") setZoomed(true);
      if (e.key === "-") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [go, onClose]);

  // When zoomed, moving the mouse pans the image (like Shopify's zoom); touch users simply scroll it.
  const pan = (event: React.MouseEvent) => {
    const el = pane.current;
    if (!zoomed || !el) return;
    const r = el.getBoundingClientRect();
    el.scrollLeft = ((event.clientX - r.left) / r.width) * (el.scrollWidth - el.clientWidth);
    el.scrollTop = ((event.clientY - r.top) / r.height) * (el.scrollHeight - el.clientHeight);
  };

  // Center the zoomed image on the point that was clicked.
  const toggle = (event: React.MouseEvent) => {
    const el = pane.current;
    if (!el) return;
    if (zoomed) {
      setZoomed(false);
      return;
    }
    const r = el.getBoundingClientRect();
    const fx = (event.clientX - r.left) / r.width;
    const fy = (event.clientY - r.top) / r.height;
    setZoomed(true);
    requestAnimationFrame(() => {
      el.scrollLeft = fx * (el.scrollWidth - el.clientWidth);
      el.scrollTop = fy * (el.scrollHeight - el.clientHeight);
    });
  };

  const control = "flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-white";

  return (
    <div role="dialog" aria-modal="true" aria-label={`${name} — zoom`} className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
        <p className="min-w-0 truncate text-sm text-white/80">
          {name} <span className="text-white/50">· {i + 1}/{images.length}</span>
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoomed(false)} disabled={!zoomed} aria-label="Zoom out" className={cn(control, "disabled:opacity-40")}><Minus className="size-5" /></button>
          <button type="button" onClick={() => setZoomed(true)} disabled={zoomed} aria-label="Zoom in" className={cn(control, "disabled:opacity-40")}><Plus className="size-5" /></button>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close" className={control}><X className="size-5" /></button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={pane}
          onMouseMove={pan}
          onClick={toggle}
          className={cn("size-full", zoomed ? "cursor-zoom-out overflow-auto" : "flex cursor-zoom-in items-center justify-center overflow-hidden")}
        >
          <img
            src={image.image_url}
            alt={image.alt_text ?? name}
            draggable={false}
            className={cn("select-none rounded-none", zoomed ? "max-w-none" : "max-h-full max-w-full object-contain")}
            style={zoomed ? { width: `${LIGHTBOX_ZOOM * 100}%`, minWidth: "100%", height: "auto" } : undefined}
          />
        </div>

        {images.length > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous image" className={cn(control, "absolute left-3 top-1/2 -translate-y-1/2")}><ChevronLeft className="size-6" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next image" className={cn(control, "absolute right-3 top-1/2 -translate-y-1/2")}><ChevronRight className="size-6" /></button>
          </>
        ) : null}
      </div>

      <p className="p-3 text-center text-xs text-white/50">{zoomed ? "Move your mouse or drag to look around · click to zoom out" : "Click the photo to zoom in"}</p>
    </div>
  );
}
