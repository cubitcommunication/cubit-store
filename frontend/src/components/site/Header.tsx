import { brand } from "@/config/brand";
import { useEffect, useRef, useState } from "react";
import { AnnouncementBar } from "@/components/site/AnnouncementBar";
import { createPortal } from "react-dom";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Facebook, Instagram, Menu, Search, X } from "lucide-react";
import { ButtonEl, ImageEl, LogoEl, SpacerEl, TextEl, Zone, rowClass, type LayoutEdit } from "@/components/site/LayoutElements";
import { ELEMENTS, useLayouts, type El, type HeaderLayout } from "@/lib/layout";
import { useContactInfo, useNavTree } from "@/lib/site-settings";
import { useBrandLogos } from "@/lib/brand";
import { SmartLink } from "@/components/site/SmartLink";
import { NavLabel } from "@/components/site/NavLabel";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { HeaderAccount, HeaderCart, HeaderWishlist, MobileMenuCommerce } from "./HeaderCommerce";

export function Header({ layout: layoutOverride, edit }: { layout?: HeaderLayout; edit?: LayoutEdit } = {}) {
  const stored = useLayouts().header;
  const layout = layoutOverride ?? stored;
  const nav = useNavTree();
  const contact = useContactInfo();
  const brandLogo = useBrandLogos();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [compact, setCompact] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function closeMenu() {
    if (!open || closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      menuButtonRef.current?.focus();
    }, 320);
  }

  function openMenu() {
    setSearchOpen(false);
    setClosing(false);
    setOpen(true);
  }

  useEffect(() => {
    setOpen(false);
    setClosing(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closing]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchOpen(false);
    setOpen(false);
    navigate({ to: "/shop", search: { q: term.trim() } });
  }

  const barHeight = {
    compact: compact ? "h-12 lg:h-14" : "h-14 lg:h-16",
    normal: compact ? "h-14 lg:h-16" : "h-16 lg:h-24",
    tall: compact ? "h-16 lg:h-20" : "h-20 lg:h-28",
  }[layout.height];

  const iconLink = "flex size-10 items-center justify-center text-foreground transition-colors hover:text-brand-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red";

  function renderEl(e: El) {
    switch (e.type) {
      case "logo":
        return <LogoEl el={e} tone="light" />;
      case "menu":
        return (
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-3 xl:gap-5">
              {nav.map((link) => (
                <li key={link.id} className="group relative">
                  <SmartLink
                    href={link.path}
                    newTab={Boolean(link.new_tab)}
                    className="relative flex items-center gap-1 whitespace-nowrap py-2 font-menu text-[0.78rem] font-medium uppercase leading-6 tracking-[0.07em] text-foreground/70 transition-colors hover:text-foreground data-[status=active]:text-foreground"
                    activeClassName="after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:bg-brand-red"
                  >
                    <NavLabel label={link.label} badge={link.badge} />
                    {link.children.length ? <ChevronDown className="size-3 opacity-60" aria-hidden="true" /> : null}
                  </SmartLink>
                  {link.children.length ? (
                    <ul className="invisible absolute left-1/2 top-full z-40 min-w-52 -translate-x-1/2 rounded-xl border border-border bg-background py-2 opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                      {link.children.map((child) => (
                        <li key={child.id}>
                          <SmartLink
                            href={child.path}
                            newTab={Boolean(child.new_tab)}
                            className="block whitespace-nowrap px-4 py-2.5 font-menu text-[0.78rem] font-medium uppercase tracking-[0.06em] text-foreground/75 transition-colors hover:bg-muted hover:text-brand-red"
                          >
                            <NavLabel label={child.label} badge={child.badge} />
                          </SmartLink>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>
        );
      case "menu_button":
        return (
          <button
            ref={menuButtonRef}
            type="button"
            onClick={openMenu}
            aria-label="Open menu"
            aria-expanded={open}
            className={cn("flex size-9 items-center justify-center text-foreground transition-colors hover:text-brand-red sm:size-10", !edit && "lg:hidden")}
          >
            <Menu className="size-5" />
          </button>
        );
      case "search":
        return (
          <button type="button" onClick={() => setSearchOpen((v) => !v)} aria-label="Search products" aria-expanded={searchOpen} className={iconLink}>
            {searchOpen ? <X className="size-5" /> : <Search className="size-5" />}
          </button>
        );
      case "wishlist":
        return <HeaderWishlist />;
      case "account":
        return <HeaderAccount />;
      case "cart":
        return <HeaderCart />;
      case "instagram":
        return (
          <a href={contact.instagramUrl} target="_blank" rel="noreferrer noopener" aria-label={`${brand.name} on Instagram, ${contact.instagramHandle}`} className={cn(iconLink, "hidden lg:flex")}>
            <Instagram className="size-5" />
          </a>
        );
      case "facebook":
        return (
          <a href={contact.facebookUrl} target="_blank" rel="noreferrer noopener" aria-label={`${brand.name} on Facebook`} className={cn(iconLink, "hidden lg:flex")}>
            <Facebook className="size-5" />
          </a>
        );
      case "whatsapp":
        return (
          <a
            href={contact.generalEnquiryUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Enquire on WhatsApp"
            onClick={() => track("whatsapp_click", { location: "header" })}
            className="flex size-9 items-center justify-center text-foreground transition-colors hover:text-brand-red sm:size-10"
          >
            <WhatsAppIcon className="size-5" />
          </a>
        );
      case "text":
        return <TextEl el={e} tone="light" />;
      case "image":
        return <ImageEl el={e} />;
      case "button":
        return <ButtonEl el={e} tone="light" />;
      case "spacer":
        return <SpacerEl el={e} axis="x" />;
      default:
        return edit ? <span className="text-xs text-muted-foreground">{ELEMENTS[e.type].label}</span> : null;
    }
  }

  const zone = (key: "left" | "center" | "right", cls: string) => (
    <Zone where={{ zone: key }} items={layout.zones[key]} axis="x" edit={edit} label={`${key} of the header`} render={renderEl} className={cn(rowClass, cls)} />
  );

  return (
    <header className={cn("z-50 rounded-b-[28px] border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:rounded-b-[36px]", layout.sticky && !edit ? "sticky top-0" : "relative")}>
      <AnnouncementBar layout={layout} />
      <div className={cn("mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6 lg:px-10", barHeight)}>
        {zone("left", "shrink-0 flex-nowrap")}
        {zone("center", "min-w-0 flex-1 justify-center")}
        {zone("right", "shrink-0 flex-nowrap justify-end")}
      </div>

      {searchOpen ? (
        <div className="border-t border-border bg-background shop-fade">
          <form
            onSubmit={submitSearch}
            role="search"
            className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-10"
          >
            <label htmlFor="site-search" className="sr-only">
              Search by name, SKU, material or occasion
            </label>
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id="site-search"
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search products or SKU…"
              className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              className="eyebrow shrink-0 bg-foreground px-4 py-2.5 text-background transition-colors hover:bg-brand-red"
            >
              Search
            </button>
          </form>
        </div>
      ) : null}

      {open ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          className={cn(
            "mobile-menu fixed inset-0 z-50 flex flex-col bg-background lg:hidden",
            closing && "is-closing",
          )}
        >
            <div className="grid h-20 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center px-5 sm:px-7">
              <Link
                to="/"
                onClick={closeMenu}
                aria-label={`${brand.name} home`}
                className="flex min-h-11 w-fit items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red"
              >
                {brandLogo.logo ? <img src={brandLogo.logo} alt={brand.name} className="h-8 w-auto" /> : <span className="font-display text-lg uppercase tracking-[0.16em]">{brand.name}</span>}
              </Link>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMenu}
                aria-label="Close menu"
                className="flex size-11 shrink-0 items-center justify-center text-foreground transition-colors hover:text-brand-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red"
              >
                <X className="size-6" strokeWidth={1.4} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-7">
              <nav aria-label="Mobile" className="mx-auto w-full max-w-md">
                <ul className="mobile-menu-list">
                  {nav.map((link) => (
                    <li key={link.id} className="mobile-menu-item">
                      <SmartLink
                        href={link.path}
                        newTab={Boolean(link.new_tab)}
                        onClick={closeMenu}
                        className="mobile-menu-link group relative flex min-h-13 items-center py-2 font-menu text-[0.875rem] font-semibold uppercase leading-[1.5] tracking-[0.08em] text-foreground transition-colors duration-200 hover:text-brand-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red active:text-brand-red data-[status=active]:text-brand-red"
                      >
                        <span className="mr-3 h-px w-0 bg-brand-red transition-all duration-200 group-data-[status=active]:w-5" />
                        <NavLabel label={link.label.toUpperCase()} badge={link.badge} />
                      </SmartLink>
                      {link.children.length ? (
                        <ul className="mb-3 ml-8 grid grid-cols-1 gap-0.5 border-l border-border pl-5">
                          {link.children.map((child) => (
                            <li key={child.id}>
                              <SmartLink
                                href={child.path}
                                newTab={Boolean(child.new_tab)}
                                onClick={closeMenu}
                                className="flex min-h-11 items-center font-sans text-[0.875rem] font-medium leading-[1.5] text-muted-foreground transition-colors hover:text-brand-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red active:text-brand-red"
                              >
                                <NavLabel label={child.label} badge={child.badge} />
                              </SmartLink>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </nav>

              <MobileMenuCommerce onNavigate={closeMenu} />

              <div className="mobile-menu-social mx-auto mt-8 grid w-full max-w-md grid-cols-3 border-t border-border pt-5">
                <a
                  href={contact.instagramUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                   className="flex min-h-12 flex-col items-center justify-center gap-1.5 font-sans text-xs font-medium uppercase text-foreground transition-colors hover:text-brand-red focus-visible:outline-2 focus-visible:outline-brand-red"
                >
                  <Instagram className="size-4" strokeWidth={1.5} /> Instagram
                </a>
                <a
                  href={contact.facebookUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                   className="flex min-h-12 flex-col items-center justify-center gap-1.5 font-sans text-xs font-medium uppercase text-foreground transition-colors hover:text-brand-red focus-visible:outline-2 focus-visible:outline-brand-red"
                >
                  <Facebook className="size-4" strokeWidth={1.5} /> Facebook
                </a>
                <a
                  href={contact.generalEnquiryUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => track("whatsapp_click", { location: "mobile_menu" })}
                   className="flex min-h-12 flex-col items-center justify-center gap-1.5 font-sans text-xs font-medium uppercase text-foreground transition-colors hover:text-brand-red focus-visible:outline-2 focus-visible:outline-brand-red"
                >
                  <WhatsAppIcon className="size-4" /> WhatsApp
                </a>
              </div>
            </div>
        </div>,
        document.body,
      ) : null}
    </header>
  );
}
