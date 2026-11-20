import { brand } from "@/config/brand";
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { policyListQuery } from "@/lib/pages";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, Mail } from "lucide-react";
import { FaFacebookF, FaInstagram, FaPinterestP, FaYoutube } from "react-icons/fa6";
import { ButtonEl, ImageEl, LogoEl, SpacerEl, TextEl, Zone, stackClass, type LayoutEdit } from "@/components/site/LayoutElements";
import { ELEMENTS, parseLinkLines, useLayouts, type El, type FooterLayout } from "@/lib/layout";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useContactInfo, useNavTree, useSiteTextExact } from "@/lib/site-settings";
import { SmartLink } from "@/components/site/SmartLink";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { useCategoryNav } from "@/lib/use-categories";
import { cn } from "@/lib/utils";

/** Terms, privacy, refund and shipping policies (Admin -> Policies) plus Contact Us, always under the footer. */
function PolicyLinks() {
  const { data } = useQuery(policyListQuery());
  const links = [...(data ?? []).map((p) => ({ label: p.title, to: `/policies/${p.slug}` })), { label: "Contact Us", to: "/contact" }];
  return (
    <nav aria-label="Policies" className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.75rem]">
      {links.map((l) => (
        <SmartLink key={l.to} href={l.to} className="text-white/75 underline-offset-4 transition-colors hover:text-white hover:underline">{l.label}</SmartLink>
      ))}
    </nav>
  );
}

const linkClass = "whitespace-nowrap text-[0.875rem] text-white/75 transition-colors hover:text-white";

/**
 * One footer column. Phones get a collapsible section (tap the title); from tablet width up it is
 * always open and the title is plain text with a red underline.
 */
function FooterSection({ title, children, className, forceOpen }: { title: string; children: ReactNode; className?: string; forceOpen?: boolean }) {
  const [openState, setOpen] = useState(false);
  const open = openState || Boolean(forceOpen);
  const id = `footer-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className={cn("border-b border-white/10 lg:border-0", className)}>
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between py-4 text-left font-display text-[1.05rem] text-white lg:pointer-events-none lg:cursor-default lg:justify-start lg:py-0 lg:pb-4"
        >
          <span className="whitespace-nowrap border-b-2 border-brand-red pb-1">{title}</span>
          <ChevronDown className={cn("size-4 text-white/60 transition-transform duration-300 lg:hidden", open && "rotate-180")} aria-hidden="true" />
        </button>
      </h2>
      <div id={id} className={cn("grid transition-[grid-template-rows] duration-300 lg:block", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden lg:overflow-visible">
          <div className="pb-5 lg:pb-0">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Please enter a valid e-mail address.");
      return;
    }
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
    <section className="py-5 lg:py-0">
      <h2 className="m-0 font-display text-[1.05rem] text-white">
        <span className="border-b-2 border-brand-red pb-1 lg:whitespace-nowrap">Subscribe to Our Updates</span>
      </h2>
      <p className="mt-4 max-w-[17rem] font-serif text-[0.8125rem] italic leading-relaxed text-white/70">
        Be the first to know about new collections, festive launches and offers.
      </p>
      <form onSubmit={submit} className="mt-4 flex max-w-sm items-center gap-0 rounded-full border border-white/30 p-1 pl-4 focus-within:border-white/70" noValidate>
        <label htmlFor="footer-email" className="sr-only">Your e-mail address</label>
        <Mail className="size-4 shrink-0 text-white/50" aria-hidden="true" />
        <input
          id="footer-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2 text-[0.8125rem] text-white outline-none placeholder:text-white/45"
        />
        <button type="submit" disabled={busy} aria-label="Subscribe" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-red text-white transition-opacity hover:opacity-90 disabled:opacity-60">
          <ArrowRight className="size-[18px]" />
        </button>
      </form>
    </section>
  );
}

export function Footer({ layout: layoutOverride, edit }: { layout?: FooterLayout; edit?: LayoutEdit } = {}) {
  const stored = useLayouts().footer;
  const layout = layoutOverride ?? stored;
  const nav = useNavTree();
  const categoryNav = useCategoryNav();
  const contact = useContactInfo();
  const protectedByRecaptcha = /^6L[A-Za-z0-9_-]{30,50}$/.test(useSiteTextExact()("recaptcha_site_key"));
  const social = "flex size-9 items-center justify-center rounded-full border border-white/70 text-white transition-colors hover:border-brand-red hover:bg-brand-red";
  const socials = [
    { url: contact.instagramUrl, label: "Instagram", Icon: FaInstagram },
    { url: contact.facebookUrl, label: "Facebook", Icon: FaFacebookF },
    { url: contact.pinterestUrl, label: "Pinterest", Icon: FaPinterestP },
    { url: contact.youtubeUrl, label: "YouTube", Icon: FaYoutube },
  ].filter((s) => /^https:\/\//i.test(s.url));

  function renderEl(e: El) {
    switch (e.type) {
      case "logo":
        return <LogoEl el={e} tone="dark" />;
      case "text":
        return <TextEl el={e} tone="dark" />;
      case "image":
        return <ImageEl el={e} />;
      case "button":
        return <ButtonEl el={e} tone="dark" />;
      case "spacer":
        return <SpacerEl el={e} axis="y" />;
      case "links": {
        const source = e.props.source;
        return (
          <ul className="space-y-2.5">
            {source === "categories" ? (
              <>
                {categoryNav.map((c) => (
                  <li key={c.slug}><Link to="/collections/$category" params={{ category: c.slug }} className={linkClass}>{c.shortLabel}</Link></li>
                ))}
                <li><Link to="/shop" className={linkClass}>All products</Link></li>
              </>
            ) : source === "custom" ? (
              parseLinkLines(e.props.items ?? "").map((l, i) => <li key={i}><SmartLink href={l.href} className={linkClass}>{l.label}</SmartLink></li>)
            ) : (
              nav.map((l) => <li key={l.id}><SmartLink href={l.path} newTab={Boolean(l.new_tab)} className={linkClass}>{l.label}</SmartLink></li>)
            )}
          </ul>
        );
      }
      case "contact":
        return (
          <ul className="space-y-3">
            <li>
              <a href={`tel:+${contact.phoneE164}`} className={cn(linkClass, "inline-flex items-center gap-2.5")}>
                <WhatsAppIcon className="size-[18px] shrink-0 text-white" /> {contact.phoneDisplay}
              </a>
            </li>
            <li>
              <a href={`mailto:${contact.email}`} className={cn(linkClass, "inline-flex items-center gap-2.5")}>
                <Mail className="size-[18px] shrink-0 text-white" /> {contact.email}
              </a>
            </li>
          </ul>
        );
      case "social":
        return socials.length ? (
          <div className="flex flex-wrap gap-2.5">
            {socials.map(({ url, label, Icon }) => (
              <a key={label} href={url} target="_blank" rel="noreferrer noopener" aria-label={`${brand.name} on ${label}`} className={social}>
                <Icon className="size-[15px]" />
              </a>
            ))}
          </div>
        ) : null;
      case "newsletter":
        return <Newsletter />;
      default:
        return edit ? <span className="text-xs text-white/60">{ELEMENTS[e.type].label}</span> : null;
    }
  }

  const cols = layout.columns.map((c) => `${c.width}fr`).join(" ");

  return (
    <footer className={cn("mt-12 rounded-t-[28px] text-white lg:mt-16 lg:rounded-t-[36px]", layout.tone === "red" ? "bg-brand-red" : "bg-[#070707]")}>
      <div className="mx-auto max-w-[1400px] px-5 pb-6 pt-10 sm:px-8 lg:px-10 lg:pb-6 lg:pt-14">
        <div>
          <div className="grid gap-0 lg:[grid-template-columns:var(--cols)]" style={{ "--cols": cols } as React.CSSProperties}>
            {layout.columns.map((c, i) => {
              const zone = (
                <Zone where={{ column: c.id }} items={c.elements} axis="y" edit={edit} label={c.title || `column ${i + 1}`} render={renderEl} className={stackClass} />
              );
              return (
                <div key={c.id} className={cn(i === 0 ? "pb-6 lg:pb-0 lg:pr-8" : "lg:border-l lg:border-white/15 lg:px-8", i === layout.columns.length - 1 && i !== 0 && "lg:pr-0")}>
                  {c.title ? <FooterSection title={c.title} forceOpen={Boolean(edit)}>{zone}</FooterSection> : <div className={i === 0 ? "" : "py-5 lg:py-0"}>{zone}</div>}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-4 text-[0.75rem] text-white/80 lg:mt-7">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/60" aria-hidden="true" />
            <p className="shrink-0 text-center">{layout.copyright}</p>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/60" aria-hidden="true" />
          </div>
          <PolicyLinks />
          {protectedByRecaptcha ? (
            <p className="mt-3 text-center text-[0.6875rem] text-white/50">
              This site is protected by reCAPTCHA and the Google{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer noopener" className="underline">Privacy Policy</a> and{" "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer noopener" className="underline">Terms of Service</a> apply.
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
