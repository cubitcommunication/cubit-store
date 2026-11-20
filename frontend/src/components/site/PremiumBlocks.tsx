import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, Check, ChevronLeft, ChevronRight, Clock, Gift, Headphones, Heart, Lock, Quote, RotateCcw, ShieldCheck, Star, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { formatPrice, LOCALE } from "@/config/brand";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { primaryImage, productsQuery, safeImage } from "@/lib/catalog";
import { parseVideo } from "@/lib/pages";
import type { PremiumBlock as PremiumBlockType, PremiumProps } from "@/lib/premium-blocks";
import { useSiteMedia } from "@/lib/site-media";
import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { SmartLink } from "@/components/site/SmartLink";
import { cn } from "@/lib/utils";

/**
 * Draws the premium page-builder elements (see lib/premium-blocks.ts for what each one holds).
 * Every element brings its own width and spacing, uses only plain text, and sends links through SmartLink.
 */

const wrap = "mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10";
const btnBase =
  "eyebrow inline-flex min-h-12 items-center justify-center rounded-lg px-7 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red";

type Tone = "dark" | "light" | "accent";
const tone = (t: string | undefined): Tone => (t === "dark" || t === "accent" ? t : "light");
const TONE_BG: Record<Tone, string> = {
  dark: "bg-foreground text-background",
  light: "bg-background text-foreground",
  accent: "bg-brand-red text-background",
};
const TONE_MUTED: Record<Tone, string> = { dark: "text-background/75", light: "text-muted-foreground", accent: "text-background/85" };
const TONE_BTN: Record<Tone, string> = {
  dark: "bg-background text-foreground hover:bg-brand-red hover:text-background",
  light: "bg-foreground text-background hover:bg-brand-red",
  accent: "bg-background text-foreground hover:bg-foreground hover:text-background",
};
const TONE_BTN_OUTLINE: Record<Tone, string> = {
  dark: "border border-background/60 text-background hover:bg-background hover:text-foreground",
  light: "border border-foreground/40 text-foreground hover:bg-foreground hover:text-background",
  accent: "border border-background/70 text-background hover:bg-background hover:text-foreground",
};

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const arr = (v: unknown): PremiumProps[] => (Array.isArray(v) ? (v as PremiumProps[]) : []);

/** A picture address (an upload, or "media:<slot>" for one of the site's own pictures) -> something safe to show. */
function usePic(value: unknown): string | null {
  const src = str(value);
  const key = src.startsWith("media:") ? src.slice(6) : "";
  const media = useSiteMedia(key);
  return key ? (media.src ?? null) : safeImage(src);
}

function Pic({ value, alt = "", className }: { value: unknown; alt?: string; className?: string }) {
  const src = usePic(value);
  return src ? <img src={src} alt={alt} loading="lazy" decoding="async" className={className} /> : <LogoPlaceholder className={cn("size-full", className)} />;
}

function Btn({ label, link, kind = "solid", t }: { label: unknown; link: unknown; kind?: "solid" | "outline"; t: Tone }) {
  const text = str(label);
  const href = str(link);
  if (!text || !href) return null;
  return (
    <SmartLink href={href} className={cn(btnBase, kind === "solid" ? TONE_BTN[t] : TONE_BTN_OUTLINE[t])}>
      {text}
    </SmartLink>
  );
}

function Head({ eyebrow, heading, t = "light", center = true }: { eyebrow?: unknown; heading?: unknown; t?: Tone; center?: boolean }) {
  const e = str(eyebrow);
  const h = str(heading);
  if (!e && !h) return null;
  return (
    <div className={cn("mb-10 max-w-2xl", center && "mx-auto text-center")}>
      {e ? <p className={cn("eyebrow mb-3", t === "light" ? "text-brand-red" : TONE_MUTED[t])}>{e}</p> : null}
      {h ? <h2 className="font-display text-3xl leading-tight tracking-tight sm:text-5xl">{h}</h2> : null}
    </div>
  );
}

function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

/* ------------------------------------------------------------------ heroes */

function HeroSplit({ p }: { p: PremiumProps }) {
  const t = tone(p.tone);
  const right = p.imageSide !== "left";
  return (
    <section className={cn("grid w-full lg:min-h-[640px] lg:grid-cols-2", TONE_BG[t])}>
      <div className={cn("flex items-center px-6 py-14 sm:px-12 lg:px-16 lg:py-20", right ? "lg:order-1" : "lg:order-2")}>
        <div className="max-w-xl">
          {str(p.eyebrow) ? <p className={cn("eyebrow mb-4", t === "light" ? "text-brand-red" : TONE_MUTED[t])}>{str(p.eyebrow)}</p> : null}
          {str(p.heading) ? <h1 className="font-display text-4xl leading-[1.04] tracking-tight sm:text-6xl">{str(p.heading)}</h1> : null}
          {str(p.text) ? <p className={cn("mt-5 whitespace-pre-line text-base leading-relaxed", TONE_MUTED[t])}>{str(p.text)}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Btn label={p.primaryLabel} link={p.primaryLink} t={t} />
            <Btn label={p.secondaryLabel} link={p.secondaryLink} kind="outline" t={t} />
          </div>
        </div>
      </div>
      <div className={cn("relative min-h-[320px] bg-muted", right ? "lg:order-2" : "lg:order-1")}>
        <Pic value={p.image} className="absolute inset-0 size-full object-cover" />
      </div>
    </section>
  );
}

function HeroVideo({ p }: { p: PremiumProps }) {
  const video = parseVideo(str(p.video));
  const poster = usePic(p.poster);
  const overlay = Math.min(85, Math.max(0, Number(p.overlay) || 0)) / 100;
  const h = p.height === "screen" ? "min-h-[100svh]" : p.height === "medium" ? "min-h-[52vh]" : "min-h-[72vh]";
  return (
    <section className={cn("relative w-full overflow-hidden bg-foreground text-background", h)}>
      {video?.kind === "file" ? (
        <video className="absolute inset-0 size-full object-cover" src={video.src} poster={poster ?? undefined} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
      ) : poster ? (
        <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-black" style={{ opacity: overlay }} aria-hidden="true" />
      <div className={cn("relative flex items-center", wrap, h)}>
        <div className="max-w-2xl py-16">
          {str(p.eyebrow) ? <p className="eyebrow mb-4 text-background/80">{str(p.eyebrow)}</p> : null}
          {str(p.heading) ? <h1 className="font-display text-4xl leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">{str(p.heading)}</h1> : null}
          {str(p.text) ? <p className="mt-5 max-w-xl whitespace-pre-line text-base leading-relaxed text-background/85">{str(p.text)}</p> : null}
          <div className="mt-8"><Btn label={p.buttonLabel} link={p.buttonLink} t="dark" /></div>
        </div>
      </div>
    </section>
  );
}

function HeroCentered({ p }: { p: PremiumProps }) {
  const t = tone(p.tone);
  const bg = usePic(p.image);
  return (
    <section className={cn("relative w-full overflow-hidden", TONE_BG[t])}>
      {bg ? <img src={bg} alt="" className="absolute inset-0 size-full object-cover opacity-40" /> : null}
      <div className={cn("relative mx-auto max-w-4xl px-4 py-20 text-center sm:py-28 lg:py-36")}>
        {str(p.badge) ? <span className="eyebrow mb-6 inline-block rounded-full border border-current/40 px-4 py-1.5">{str(p.badge)}</span> : null}
        {str(p.heading) ? <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">{str(p.heading)}</h1> : null}
        {str(p.text) ? <p className={cn("mx-auto mt-6 max-w-2xl whitespace-pre-line text-base leading-relaxed sm:text-lg", TONE_MUTED[t])}>{str(p.text)}</p> : null}
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Btn label={p.primaryLabel} link={p.primaryLink} t={t} />
          <Btn label={p.secondaryLabel} link={p.secondaryLink} kind="outline" t={t} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ social proof */

function Stars({ n }: { n: number }) {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${full} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} className={cn("size-4", i < full ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} aria-hidden="true" />)}
    </span>
  );
}

function TestimonialCard({ q }: { q: PremiumProps }) {
  const photo = usePic(q.image);
  const name = str(q.name);
  return (
    <figure className="flex h-full flex-col rounded-2xl border border-border bg-background p-7 shadow-sm">
      <Stars n={Number(q.rating) || 0} />
      <blockquote className="mt-4 flex-1 whitespace-pre-line text-[15px] leading-relaxed">{str(q.quote)}</blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        {photo ? <img src={photo} alt="" loading="lazy" className="size-11 rounded-full object-cover" /> : <span className="flex size-11 items-center justify-center rounded-full bg-muted text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</span>}
        <span className="text-sm"><span className="block font-semibold">{name}</span><span className="text-muted-foreground">{str(q.role)}</span></span>
      </figcaption>
    </figure>
  );
}

function Testimonials({ p }: { p: PremiumProps }) {
  const items = arr(p.items);
  const track_ = useRef<HTMLDivElement>(null);
  const slide = (dir: -1 | 1) => track_.current?.scrollBy({ left: dir * (track_.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section className={cn("bg-surface py-16 lg:py-24")}>
      <div className={wrap}>
        <Head eyebrow={p.eyebrow} heading={p.heading} />
        {p.layout === "slider" ? (
          <div className="relative">
            <div ref={track_} className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {items.map((q, i) => <div key={i} className="w-[85%] shrink-0 snap-start sm:w-[46%] lg:w-[32%]"><TestimonialCard q={q} /></div>)}
            </div>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => slide(-1)} aria-label="Previous" className="flex size-10 items-center justify-center rounded-full border border-border hover:bg-background"><ChevronLeft className="size-5" /></button>
              <button type="button" onClick={() => slide(1)} aria-label="Next" className="flex size-10 items-center justify-center rounded-full border border-border hover:bg-background"><ChevronRight className="size-5" /></button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{items.map((q, i) => <TestimonialCard key={i} q={q} />)}</div>
        )}
      </div>
    </section>
  );
}

function Logos({ p }: { p: PremiumProps }) {
  const items = arr(p.items).filter((i) => str(i.image));
  if (!items.length && !str(p.heading)) return null;
  return (
    <section className="py-12 lg:py-16">
      <div className={wrap}>
        {str(p.heading) ? <p className="eyebrow mb-8 text-center text-muted-foreground">{str(p.heading)}</p> : null}
        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {items.map((l, i) => {
            const img = <Pic value={l.image} alt={str(l.alt)} className={cn("h-8 w-auto max-w-[9rem] object-contain sm:h-10", p.grayscale && "opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0")} />;
            return <li key={i}>{str(l.link) ? <SmartLink href={str(l.link)} ariaLabel={str(l.alt) || undefined}>{img}</SmartLink> : img}</li>;
          })}
        </ul>
      </div>
    </section>
  );
}

function CountUp({ to, prefix, suffix }: { to: number; prefix: string; suffix: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 1400);
      setN(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to]);
  const decimals = Number.isInteger(to) ? 0 : 1;
  return <span ref={ref}>{prefix}{n.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

function Stats({ p }: { p: PremiumProps }) {
  const t = tone(p.tone);
  const items = arr(p.items);
  return (
    <section className={cn("py-14 lg:py-20", TONE_BG[t])}>
      <div className={wrap}>
        <Head heading={p.heading} t={t} />
        <dl className="grid grid-cols-2 gap-y-10 text-center lg:grid-cols-4">
          {items.map((s, i) => (
            <div key={i}>
              <dt className="sr-only">{str(s.label)}</dt>
              <dd className="font-display text-4xl tracking-tight sm:text-6xl"><CountUp to={Number(s.value) || 0} prefix={str(s.prefix)} suffix={str(s.suffix)} /></dd>
              <p className={cn("mt-2 text-sm", TONE_MUTED[t])} aria-hidden="true">{str(s.label)}</p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function BigQuote({ p }: { p: PremiumProps }) {
  const t = tone(p.tone);
  const photo = usePic(p.image);
  return (
    <section className={cn("py-16 lg:py-24", TONE_BG[t])}>
      <figure className="mx-auto max-w-3xl px-4 text-center">
        <Quote className="mx-auto size-10 opacity-40" aria-hidden="true" />
        <blockquote className="mt-6 font-display text-2xl leading-snug tracking-tight sm:text-4xl">{str(p.quote)}</blockquote>
        <figcaption className="mt-8 flex items-center justify-center gap-3 text-sm">
          {photo ? <img src={photo} alt="" loading="lazy" className="size-12 rounded-full object-cover" /> : null}
          <span><span className="block font-semibold">{str(p.name)}</span><span className={TONE_MUTED[t]}>{str(p.role)}</span></span>
        </figcaption>
      </figure>
    </section>
  );
}

/* ------------------------------------------------------------------ conversion */

function Marquee({ p }: { p: PremiumProps }) {
  const t = tone(p.tone);
  const items = arr(p.items).map((i) => str(i.text)).filter(Boolean);
  if (!items.length) return null;
  const secs = p.speed === "fast" ? 18 : p.speed === "slow" ? 55 : 32;
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((text, i) => (
        <li key={i} className="eyebrow flex items-center whitespace-nowrap px-8">{text}<span className="ml-16 inline-block size-1.5 rounded-full bg-current opacity-50" aria-hidden="true" /></li>
      ))}
    </ul>
  );
  return (
    <section className={cn("shop-marquee overflow-hidden py-4", TONE_BG[t])} aria-label="Announcements">
      <div className="shop-marquee-track flex w-max" style={{ "--marquee-duration": `${secs}s` } as React.CSSProperties}>{row(false)}{row(true)}</div>
    </section>
  );
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

function Countdown({ p }: { p: PremiumProps }) {
  const t = tone(p.tone);
  const end = useMemo(() => {
    const v = str(p.endsAt);
    const ms = v ? new Date(v).getTime() : NaN;
    return Number.isNaN(ms) ? null : ms;
  }, [p.endsAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [end]);
  const left = end === null ? null : end - now;
  const ended = left !== null && left <= 0;
  const c = parts(left ?? 0);
  const box = (n: number, label: string) => (
    <div className="min-w-[4.5rem] rounded-xl border border-current/25 px-3 py-3 text-center sm:min-w-[6rem]">
      <div className="font-display text-3xl tabular-nums sm:text-5xl">{String(n).padStart(2, "0")}</div>
      <div className={cn("eyebrow mt-1 text-[10px]", TONE_MUTED[t])}>{label}</div>
    </div>
  );
  return (
    <section className={cn("py-14 lg:py-20", TONE_BG[t])}>
      <div className="mx-auto max-w-3xl px-4 text-center">
        {str(p.eyebrow) ? <p className={cn("eyebrow mb-3", TONE_MUTED[t])}>{str(p.eyebrow)}</p> : null}
        {str(p.heading) ? <h2 className="font-display text-3xl tracking-tight sm:text-5xl">{str(p.heading)}</h2> : null}
        {str(p.text) ? <p className={cn("mx-auto mt-4 max-w-xl text-base", TONE_MUTED[t])}>{str(p.text)}</p> : null}
        {left !== null && !ended ? (
          <div className="mt-8 flex justify-center gap-3" role="timer" aria-label="Time left">{box(c.d, "Days")}{box(c.h, "Hours")}{box(c.m, "Mins")}{box(c.s, "Secs")}</div>
        ) : ended ? <p className="mt-8 text-lg font-medium">{str(p.endedText)}</p> : null}
        {!ended ? <div className="mt-9"><Btn label={p.buttonLabel} link={p.buttonLink} t={t} /></div> : null}
      </div>
    </section>
  );
}

function PromoBanner({ p }: { p: PremiumProps }) {
  const t = tone(p.tone);
  const bg = usePic(p.image);
  const code = str(p.code);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy. Please type the code.");
    }
  }
  return (
    <section className={cn("relative overflow-hidden", TONE_BG[t])}>
      {bg ? <img src={bg} alt="" className="absolute inset-0 size-full object-cover opacity-40" /> : null}
      <div className={cn("relative flex flex-col items-center gap-6 py-14 text-center sm:py-20 lg:flex-row lg:justify-between lg:text-left", wrap)}>
        <div className="max-w-2xl">
          {str(p.badge) ? <span className="eyebrow mb-4 inline-block rounded-full bg-background px-4 py-1.5 text-foreground">{str(p.badge)}</span> : null}
          {str(p.heading) ? <h2 className="font-display text-3xl leading-tight tracking-tight sm:text-5xl">{str(p.heading)}</h2> : null}
          {str(p.text) ? <p className={cn("mt-3 text-base", TONE_MUTED[t])}>{str(p.text)}</p> : null}
        </div>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          {code ? (
            <button type="button" onClick={copy} className="eyebrow rounded-lg border-2 border-dashed border-current/60 px-6 py-3 transition hover:bg-background/10" aria-label={`Copy discount code ${code}`}>{code}</button>
          ) : null}
          <Btn label={p.buttonLabel} link={p.buttonLink} t={t} />
        </div>
      </div>
    </section>
  );
}

function NewsletterBlock({ p }: { p: PremiumProps }) {
  const t = tone(p.tone);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return void toast.error("Please enter a valid e-mail address.");
    setBusy(true);
    try {
      await api("/newsletter", { method: "POST", body: { email: email.trim() }, recaptcha: "newsletter" });
      track("generate_lead", { method: "newsletter" });
      toast.success("Thank you! You're on the list.");
      setEmail("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not subscribe right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={cn("py-14 lg:py-20", t === "light" ? "bg-surface text-foreground" : TONE_BG[t])}>
      <div className="mx-auto max-w-2xl px-4 text-center">
        {str(p.heading) ? <h2 className="font-display text-3xl tracking-tight sm:text-4xl">{str(p.heading)}</h2> : null}
        {str(p.text) ? <p className={cn("mt-3 text-base", TONE_MUTED[t])}>{str(p.text)}</p> : null}
        <form onSubmit={submit} noValidate className="mx-auto mt-7 flex max-w-md flex-col gap-3 sm:flex-row">
          <label htmlFor={`nl-${str(p.heading).length}`} className="sr-only">Your e-mail address</label>
          <input id={`nl-${str(p.heading).length}`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your e-mail address" className="min-h-12 flex-1 rounded-lg border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-foreground" />
          <button type="submit" disabled={busy} className={cn(btnBase, TONE_BTN[t === "light" ? "light" : t], "disabled:opacity-60")}>{str(p.buttonLabel) || "Subscribe"}</button>
        </form>
      </div>
    </section>
  );
}

const ICONS: Record<string, typeof Truck> = { truck: Truck, shield: ShieldCheck, refresh: RotateCcw, headset: Headphones, gift: Gift, star: Star, lock: Lock, heart: Heart, award: Award, clock: Clock };

function TrustBadges({ p }: { p: PremiumProps }) {
  const dark = p.tone === "dark";
  const items = arr(p.items);
  return (
    <section className={cn("border-y border-border py-10 lg:py-12", dark ? "bg-foreground text-background" : "bg-background")}>
      <ul className={cn("grid gap-8 sm:grid-cols-2 lg:grid-cols-4", wrap)}>
        {items.map((b, i) => {
          const Icon = ICONS[str(b.icon)] ?? Star;
          return (
            <li key={i} className="flex items-start gap-4">
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", dark ? "bg-background/10" : "bg-muted")}><Icon className="size-5" aria-hidden="true" /></span>
              <span><span className="block text-sm font-semibold">{str(b.title)}</span><span className={cn("text-sm", dark ? "text-background/70" : "text-muted-foreground")}>{str(b.text)}</span></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Pricing({ p }: { p: PremiumProps }) {
  const plans = arr(p.plans);
  return (
    <section className="py-16 lg:py-24">
      <div className={wrap}>
        <Head heading={p.heading} />
        {str(p.text) ? <p className="-mt-6 mb-10 text-center text-base text-muted-foreground">{str(p.text)}</p> : null}
        <div className="mx-auto grid max-w-6xl items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((pl, i) => {
            const hi = Boolean(pl.highlight);
            const features = str(pl.features).split("\n").map((f) => f.trim()).filter(Boolean);
            return (
              <div key={i} className={cn("relative flex flex-col rounded-2xl border p-8", hi ? "border-foreground bg-foreground text-background shadow-xl lg:scale-[1.03]" : "border-border bg-background")}>
                {hi ? <span className="eyebrow absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-red px-4 py-1 text-background">Most popular</span> : null}
                <h3 className="font-display text-xl">{str(pl.name)}</h3>
                <p className="mt-4 flex items-baseline gap-1"><span className="font-display text-5xl tracking-tight">{str(pl.price)}</span>{str(pl.period) ? <span className={cn("text-sm", hi ? "text-background/70" : "text-muted-foreground")}>/ {str(pl.period)}</span> : null}</p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {features.map((f, j) => <li key={j} className="flex items-start gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-brand-red" aria-hidden="true" />{f}</li>)}
                </ul>
                <div className="mt-8 flex"><Btn label={pl.buttonLabel} link={pl.buttonLink} t={hi ? "accent" : "light"} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ content & media */

function Gallery({ p }: { p: PremiumProps }) {
  const items = arr(p.items).filter((i) => str(i.image));
  const [open, setOpen] = useState<number | null>(null);
  const cols = ({ "2": "sm:grid-cols-2", "3": "sm:grid-cols-2 lg:grid-cols-3", "4": "sm:grid-cols-2 lg:grid-cols-4" } as Record<string, string>)[str(p.columns)] ?? "sm:grid-cols-2 lg:grid-cols-3";
  const masonry = p.layout === "masonry";
  const go = (d: number) => setOpen((o) => (o === null ? o : (o + d + items.length) % items.length));
  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);
  const current = open === null ? null : items[open];
  const big = usePic(current?.image);
  return (
    <section className="py-14 lg:py-20">
      <div className={wrap}>
        <Head heading={p.heading} />
        <ul className={cn(masonry ? "gap-4 [column-fill:_balance] columns-2 lg:columns-3 [&>li]:mb-4" : cn("grid grid-cols-2 gap-4", cols))}>
          {items.map((it, i) => (
            <li key={i} className={masonry ? "break-inside-avoid" : undefined}>
              <button type="button" onClick={() => setOpen(i)} className="group block w-full overflow-hidden rounded-xl bg-muted" aria-label={str(it.caption) ? `Open: ${str(it.caption)}` : `Open picture ${i + 1}`}>
                <Pic value={it.image} alt={str(it.caption)} className={cn("w-full object-cover transition-transform duration-500 group-hover:scale-105", masonry ? "h-auto" : "aspect-square")} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {current && open !== null ? (
        <div role="dialog" aria-modal="true" aria-label="Picture viewer" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><X className="size-6" /></button>
          {items.length > 1 ? <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous" className="absolute left-3 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft className="size-6" /></button> : null}
          <figure className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {big ? <img src={big} alt={str(current.caption)} className="max-h-[82vh] w-auto rounded-lg object-contain" /> : null}
            {str(current.caption) ? <figcaption className="mt-3 text-center text-sm text-white/80">{str(current.caption)}</figcaption> : null}
          </figure>
          {items.length > 1 ? <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next" className="absolute right-3 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight className="size-6" /></button> : null}
        </div>
      ) : null}
    </section>
  );
}

function Timeline({ p }: { p: PremiumProps }) {
  const items = arr(p.items);
  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Head heading={p.heading} />
        <ol className="relative space-y-10 border-l-2 border-border pl-8">
          {items.map((s, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[2.85rem] flex size-9 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background ring-4 ring-background">{i + 1}</span>
              {str(s.label) ? <p className="eyebrow text-brand-red">{str(s.label)}</p> : null}
              <h3 className="mt-1 font-display text-xl">{str(s.title)}</h3>
              {str(s.text) ? <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{str(s.text)}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Tabs({ p }: { p: PremiumProps }) {
  const tabs = arr(p.tabs);
  const [active, setActive] = useState(0);
  const cur = tabs[Math.min(active, Math.max(0, tabs.length - 1))];
  const pic = usePic(cur?.image);
  if (!cur) return null;
  return (
    <section className="py-16 lg:py-24">
      <div className={wrap}>
        <Head heading={p.heading} />
        <div role="tablist" aria-label={str(p.heading) || "Tabs"} className="mb-8 flex flex-wrap justify-center gap-2">
          {tabs.map((tb, i) => (
            <button key={i} type="button" role="tab" id={`ptab-${i}`} aria-selected={i === active} aria-controls="ptab-panel" onClick={() => setActive(i)}
              className={cn("eyebrow rounded-full border px-5 py-2.5 transition-colors", i === active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground")}>
              {str(tb.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="ptab-panel" aria-labelledby={`ptab-${active}`} className={cn("grid items-center gap-8 rounded-2xl bg-surface p-6 sm:p-10", pic && "lg:grid-cols-2")}>
          <div>
            <h3 className="font-display text-2xl sm:text-3xl">{str(cur.title)}</h3>
            {str(cur.text) ? <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-muted-foreground">{str(cur.text)}</p> : null}
            {str(cur.link) ? <div className="mt-6"><Btn label="Explore" link={cur.link} t="light" /></div> : null}
          </div>
          {pic ? <img src={pic} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /> : null}
        </div>
      </div>
    </section>
  );
}

function CollectionTiles({ p }: { p: PremiumProps }) {
  const items = arr(p.items);
  const cols = ({ "2": "sm:grid-cols-2", "3": "sm:grid-cols-2 lg:grid-cols-3", "4": "sm:grid-cols-2 lg:grid-cols-4" } as Record<string, string>)[str(p.columns)] ?? "sm:grid-cols-2 lg:grid-cols-3";
  const shape = p.shape === "wide" ? "aspect-[16/10]" : p.shape === "square" ? "aspect-square" : "aspect-[4/5]";
  return (
    <section className="py-14 lg:py-20">
      <div className={wrap}>
        <Head heading={p.heading} />
        <ul className={cn("grid grid-cols-1 gap-5", cols)}>
          {items.map((it, i) => {
            const body = (
              <div className={cn("group relative overflow-hidden rounded-2xl bg-muted", shape)}>
                <Pic value={it.image} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  {str(it.subtitle) ? <p className="eyebrow mb-1 text-white/80">{str(it.subtitle)}</p> : null}
                  <h3 className="font-display text-2xl">{str(it.title)}</h3>
                </div>
              </div>
            );
            return <li key={i}>{str(it.link) ? <SmartLink href={str(it.link)} className="block">{body}</SmartLink> : body}</li>;
          })}
        </ul>
      </div>
    </section>
  );
}

function BeforeAfter({ p }: { p: PremiumProps }) {
  const [pos, setPos] = useState(50);
  const before = usePic(p.before);
  const after = usePic(p.after);
  return (
    <section className="py-14 lg:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <Head heading={p.heading} />
        <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-2xl bg-muted">
          {after ? <img src={after} alt={str(p.afterLabel)} className="absolute inset-0 size-full object-cover" draggable={false} /> : <LogoPlaceholder className="absolute inset-0" />}
          {before ? <img src={before} alt={str(p.beforeLabel)} className="absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} /> : null}
          <span className="eyebrow absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-white">{str(p.beforeLabel)}</span>
          <span className="eyebrow absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1 text-white">{str(p.afterLabel)}</span>
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} aria-hidden="true">
            <span className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-foreground shadow-lg"><ChevronLeft className="size-4" /><ChevronRight className="-ml-1 size-4" /></span>
          </div>
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Compare before and after" className="absolute inset-0 size-full cursor-ew-resize opacity-0" />
        </div>
      </div>
    </section>
  );
}

function ProductSpotlight({ p }: { p: PremiumProps }) {
  const { data } = useQuery(productsQuery());
  const slug = str(p.slug).trim();
  const product = (data ?? []).find((x) => x.slug === slug) ?? null;
  const img = primaryImage(product ?? ({ product_images: [] } as never))?.image_url ?? null;
  const left = p.imageSide !== "right";
  if (!slug) return null;
  return (
    <section className="py-14 lg:py-20">
      <div className={cn("grid items-center gap-10 lg:grid-cols-2 lg:gap-16", wrap)}>
        <div className={cn("aspect-[4/5] overflow-hidden rounded-2xl bg-muted", left ? "lg:order-1" : "lg:order-2")}>
          {img ? <img src={safeImage(img) ?? ""} alt={product?.name ?? ""} loading="lazy" className="size-full object-cover" /> : <LogoPlaceholder className="size-full" />}
        </div>
        <div className={left ? "lg:order-2" : "lg:order-1"}>
          {str(p.eyebrow) ? <p className="eyebrow mb-3 text-brand-red">{str(p.eyebrow)}</p> : null}
          <h2 className="font-display text-3xl leading-tight tracking-tight sm:text-5xl">{product?.name ?? "Product not found"}</h2>
          {product ? <p className="mt-4 text-2xl font-medium">{formatPrice(product.price)}{product.compare_at_price && product.compare_at_price > product.price ? <span className="ml-3 text-base text-muted-foreground line-through">{formatPrice(product.compare_at_price)}</span> : null}</p> : null}
          {str(p.text) || product?.description ? <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-muted-foreground">{str(p.text) || product?.description}</p> : null}
          {product ? <div className="mt-8"><Btn label={str(p.buttonLabel) || "View product"} link={`/product/${product.slug}`} t="light" /></div> : null}
        </div>
      </div>
    </section>
  );
}

const MAP_OK = /^https:\/\/(www\.google\.com\/maps\/embed|maps\.google\.com\/maps\?)/i;

function MapContact({ p }: { p: PremiumProps }) {
  const embed = str(p.embed).trim();
  const phone = str(p.phone).trim();
  const email = str(p.email).trim();
  const rows: [string, ReactNode][] = [
    ["Address", str(p.address) ? <span className="whitespace-pre-line">{str(p.address)}</span> : null],
    ["Hours", str(p.hours) ? <span className="whitespace-pre-line">{str(p.hours)}</span> : null],
    ["Phone", phone ? <a className="underline" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a> : null],
    ["E-mail", email ? <a className="underline" href={`mailto:${email}`}>{email}</a> : null],
  ];
  return (
    <section className="py-14 lg:py-20">
      <div className={wrap}>
        <Head heading={p.heading} />
        <div className={cn("grid gap-8", MAP_OK.test(embed) && "lg:grid-cols-[1fr_1.4fr]")}>
          <dl className="space-y-5 self-center">
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="eyebrow text-muted-foreground">{k}</dt><dd className="mt-1 text-base">{v}</dd></div>
            ))}
          </dl>
          {MAP_OK.test(embed) ? <iframe title="Map" src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="aspect-[4/3] min-h-[320px] w-full rounded-2xl border-0" /> : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ entry */

export function PremiumBlockView({ block }: { block: PremiumBlockType }) {
  const p = block.props ?? {};
  switch (block.type) {
    case "p_hero_split": return <HeroSplit p={p} />;
    case "p_hero_video": return <HeroVideo p={p} />;
    case "p_hero_centered": return <HeroCentered p={p} />;
    case "p_testimonials": return <Testimonials p={p} />;
    case "p_logos": return <Logos p={p} />;
    case "p_stats": return <Stats p={p} />;
    case "p_quote": return <BigQuote p={p} />;
    case "p_marquee": return <Marquee p={p} />;
    case "p_countdown": return <Countdown p={p} />;
    case "p_promo_banner": return <PromoBanner p={p} />;
    case "p_newsletter": return <NewsletterBlock p={p} />;
    case "p_trust_badges": return <TrustBadges p={p} />;
    case "p_pricing": return <Pricing p={p} />;
    case "p_gallery": return <Gallery p={p} />;
    case "p_timeline": return <Timeline p={p} />;
    case "p_tabs": return <Tabs p={p} />;
    case "p_collection_tiles": return <CollectionTiles p={p} />;
    case "p_before_after": return <BeforeAfter p={p} />;
    case "p_product_spotlight": return <ProductSpotlight p={p} />;
    case "p_map": return <MapContact p={p} />;
    default: return null;
  }
}
