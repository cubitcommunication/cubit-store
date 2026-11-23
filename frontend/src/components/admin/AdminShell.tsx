import { brand } from "@/config/brand";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Clapperboard, Percent, Plug, ExternalLink, LayoutGrid, Mail, FileText, FolderTree, HelpCircle, Home, Layers, LifeBuoy, Menu, Package, Search,
  PanelsTopLeft, LayoutTemplate, PanelTop, Newspaper, ShieldCheck, ShoppingBasket, MailCheck, Settings, Store, ChevronDown, ShoppingCart, SlidersHorizontal, Tag, Users, X, DownloadCloud, UserCog, Palette, Images, Bell, Undo2, Warehouse, BarChart3, Megaphone,
} from "lucide-react";
import { adminSignOut } from "@/lib/auth.functions";
import { api } from "@/lib/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { SETTINGS_PATHS, SettingsDialog, isSettingsPath } from "@/components/admin/SettingsDialog";

type NavItem = { to: string; label: string; icon: typeof Home; exact?: boolean; badge?: number | undefined };

/** The signed-in admin's to-do counts, shown as badges in the sidebar. */
function useAdminCounts() {
  const { data } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => api<{ unfulfilled: number }>("/admin/dashboard"),
    staleTime: 30_000,
    retry: false,
  });
  return data;
}

/**
 * Shopify-style admin frame: dark top bar with search, light sidebar, grey canvas.
 * Existing admin pages keep passing `title`/`actions`; the frame around them is new.
 */
export function AdminShell({ title, actions, children, back }: { title: string; actions?: ReactNode; children: ReactNode; back?: { to: string; label: string } }) {
  const { email, isSuper } = useAdminAuth();
  const counts = useAdminCounts();
  const [menu, setMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTo, setSettingsTo] = useState<string | undefined>(undefined);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The Settings pop-up shows the real settings pages inside a frame; there they drop the admin chrome.
  const embedded = typeof window !== "undefined" && window.self !== window.top;

  useEffect(() => {
    setMenu(false);
    setSettingsOpen(false);
  }, [pathname]);

  // Lets the admin be added to a phone's Home Screen or a computer as an app (needed for notifications on iPhone).
  useEffect(() => {
    if (embedded) return;
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/admin.webmanifest";
    document.head.appendChild(link);
    return () => link.remove();
  }, [embedded]);

  const openSettings = (to?: string) => {
    setMenu(false);
    setSettingsTo(to);
    setSettingsOpen(true);
  };

  async function logOut() {
    try {
      await adminSignOut();
    } finally {
      window.location.assign("/admin");
    }
  }

  const top: NavItem[] = [
    { to: "/admin/dashboard", label: "Home", icon: Home },
    { to: "/admin/orders", label: "Orders", icon: ShoppingCart, badge: counts?.unfulfilled },
    { to: "/admin/returns", label: "Returns", icon: Undo2 },
  ];
  // Everything about the catalogue lives under one dropdown.
  const catalogue: NavItem[] = [
    { to: "/admin/products", label: "Products", icon: Package },
    { to: "/admin/inventory", label: "Inventory", icon: Warehouse },
    { to: "/admin/collections", label: "Collections", icon: Layers },
    { to: "/admin/categories", label: "Categories", icon: FolderTree },
    { to: "/admin/tags", label: "Tags", icon: Tag },
  ];
  const rest: NavItem[] = [
    { to: "/admin/customers", label: "Customers", icon: Users },
    { to: "/admin/coupons", label: "Discounts", icon: Percent },
    { to: "/admin/reports", label: "Reports", icon: BarChart3 },
    { to: "/admin/marketing", label: "Marketing", icon: Megaphone },
    { to: "/admin/subscribers", label: "Subscribers", icon: Mail },
    { to: "/admin/abandoned", label: "Abandoned carts", icon: ShoppingBasket },
    { to: "/admin/reels", label: "Reels", icon: Clapperboard },
    { to: "/admin/media", label: "Media", icon: Images },
  ];
  const store: NavItem[] = [
    { to: "/admin/pages", label: "Pages", icon: PanelsTopLeft },
    { to: "/admin/pages/templates", label: "Page templates", icon: LayoutTemplate },
    { to: "/admin/blogs", label: "Blog posts", icon: Newspaper },
    { to: "/admin/policies", label: "Policies", icon: ShieldCheck },
    { to: "/admin/website-content/navigation", label: "Navigation", icon: Menu },
    { to: "/admin/layout/header", label: "Header & footer", icon: PanelTop },
    { to: "/admin/website-content/seo", label: "SEO", icon: Search },
  ];
  const inSettings = SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const sidebar = (
    <div className="flex h-full flex-col">
      <nav aria-label="Admin sections" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-3">
        <div className="space-y-0.5">
          <ul className="space-y-0.5">{top.map((i) => <SideLink key={i.to} item={i} />)}</ul>
          <NavGroup label="Products" icon={Tag} items={catalogue} pathname={pathname} />
          <ul className="space-y-0.5">{rest.map((i) => <SideLink key={i.to} item={i} />)}</ul>
        </div>
        <NavGroup label="Online store" icon={Store} items={store} pathname={pathname} />
      </nav>
      <div className="border-t border-[#d4d4d4] p-3">
        <button
          type="button"
          onClick={() => openSettings()}
          aria-haspopup="dialog"
          className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[#303030] hover:bg-[#f7f7f7]", inSettings && "bg-white shadow-[0_1px_0_rgba(26,26,26,0.07)]")}
        >
          <Settings className="size-4 shrink-0 text-[#616161]" />
          Settings
        </button>
      </div>
    </div>
  );

  // Inside the Settings pop-up: just the page (title, Save buttons, content), no top bar or sidebar.
  if (embedded) {
    return (
      <div className="admin-ui min-h-screen bg-[#f1f1f1] text-[#303030]">
        <main className="px-4 pb-8 pt-2 sm:px-6">
          <div className="mx-auto max-w-[1280px]">
            {back ? <Link to={back.to} className="mb-1 inline-block text-[13px] text-[#005bd3] hover:underline">← {back.label}</Link> : null}
            <div className="sticky top-0 z-30 -mx-4 mb-3 flex min-h-[34px] flex-wrap items-center justify-between gap-3 bg-[#f1f1f1] px-4 py-2.5 pr-14 sm:-mx-6 sm:px-6 sm:pr-14">
              <h1 className="text-xl font-semibold tracking-tight text-[#303030]">{title}</h1>
              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-ui flex min-h-screen flex-col bg-[#f1f1f1] text-[#303030]">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-[#1a1a1a] px-3 text-white sm:px-4">
        <button type="button" aria-label="Open menu" onClick={() => setMenu(true)} className="rounded-lg p-2 hover:bg-white/10 lg:hidden">
          <Menu className="size-5" />
        </button>
        <Link to="/admin/dashboard" className="flex items-center gap-2 pr-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-md bg-white text-[13px] font-bold text-[#1a1a1a]">P</span>
          <span className="hidden sm:inline">{brand.name}</span>
        </Link>
        <JumpSearch onSettings={openSettings} isSuper={isSuper} />
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <a href={brand.storefrontUrl || "/"} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] hover:bg-white/10 sm:flex">
            <ExternalLink className="size-4" /> View store
          </a>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <span className="flex size-7 items-center justify-center rounded-full bg-[#fed3d1] text-xs font-bold text-[#8e1f0b]">{(email ?? "A").slice(0, 1).toUpperCase()}</span>
              <span className="hidden max-w-[160px] truncate text-[13px] md:inline">{email}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#e3e3e3] bg-white p-1 text-[13px] text-[#303030] shadow-lg">
              <p className="truncate px-3 py-2 text-xs text-[#616161]">{email}</p>
              {isSuper ? <Link to="/admin/settings" className="block rounded-lg px-3 py-2 hover:bg-[#f1f1f1]">Account & security</Link> : null}
              <button type="button" onClick={() => void logOut()} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f1f1f1]">Log out</button>
            </div>
          </details>
        </div>
      </header>

      <div className="flex flex-1">
        {/* The grey column stretches with the page; the menu inside sticks and is 1px shorter than a full screen,
            so rounding on scaled displays can never make the whole page a pixel taller than the window. */}
        <div className="hidden w-60 shrink-0 bg-[#ebebeb] lg:block">
          <aside className="sticky top-14 h-[calc(100vh-3.5rem-1px)]">{sidebar}</aside>
        </div>
        {menu ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-y-0 left-0 w-64 bg-[#ebebeb] shadow-xl">
              <button type="button" aria-label="Close" onClick={() => setMenu(false)} className="absolute right-2 top-2 rounded-lg p-2 hover:bg-black/10"><X className="size-4" /></button>
              <div className="h-full pt-10">{sidebar}</div>
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 px-3 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1100px]">
            {back ? <Link to={back.to} className="mb-1 inline-block text-[13px] text-[#005bd3] hover:underline">← {back.label}</Link> : null}
            {/* Sticks under the top bar so Save / Discard are always in reach while scrolling. */}
            <div className="sticky top-14 z-30 -mx-3 mb-3 flex min-h-[34px] flex-wrap items-center justify-between gap-3 bg-[#f1f1f1] px-3 py-2.5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <h1 className="text-xl font-semibold tracking-tight text-[#303030]">{title}</h1>
              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            {children}
          </div>
        </main>
      </div>
      {settingsOpen ? <SettingsDialog initial={settingsTo} isSuper={isSuper} onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

/** A sidebar dropdown that opens by itself when the current page is inside it. */
function NavGroup({ label, icon: Icon, items, pathname }: { label: string; icon: typeof Home; items: NavItem[]; pathname: string }) {
  return (
    <details className="group" open={items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[#f7f7f7]">
        <Icon className="size-4 shrink-0 text-[#616161]" />
        <span className="flex-1">{label}</span>
        <ChevronDown className="size-4 text-[#616161] transition-transform group-open:rotate-180" />
      </summary>
      <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-[#d4d4d4] pl-2">{items.map((i) => <SideLink key={i.to} item={i} />)}</ul>
    </details>
  );
}

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.to}
        activeOptions={{ exact: item.exact ?? false }}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#303030] hover:bg-[#f7f7f7] [&.active]:bg-white [&.active]:shadow-[0_1px_0_rgba(26,26,26,0.07)]"
      >
        <Icon className="size-4 shrink-0 text-[#616161]" />
        <span className="flex-1">{item.label}</span>
        {item.badge ? <span className="rounded-full bg-[#e3e3e3] px-1.5 text-xs font-semibold">{item.badge}</span> : null}
      </Link>
    </li>
  );
}

/** Top-bar "jump to" search: type a page name (or an order number) and go. */
function JumpSearch({ onSettings, isSuper }: { onSettings: (to: string) => void; isSuper: boolean }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  const allPages = useMemo(
    () => [
      { label: "Home", to: "/admin/dashboard", icon: Home },
      { label: "Orders", to: "/admin/orders", icon: ShoppingCart },
      { label: "Returns (customer return requests)", to: "/admin/returns", icon: Undo2 },
      { label: "Inventory (stock levels and history)", to: "/admin/inventory", icon: Warehouse },
      { label: "Reports (sales, products, customers)", to: "/admin/reports", icon: BarChart3 },
      { label: "Marketing (product feed for Google and Meta)", to: "/admin/marketing", icon: Megaphone },
      { label: "Products", to: "/admin/products", icon: Package },
      { label: "Add product", to: "/admin/products/new", icon: Tag },
      { label: "Import products (CSV)", to: "/admin/products/import", icon: DownloadCloud },
      { label: "Collections", to: "/admin/collections", icon: Layers },
      { label: "Product tags (sales, bulk tagging)", to: "/admin/tags", icon: Tag },
      { label: "Notifications (which events alert you)", to: "/admin/notifications", icon: Bell },
      { label: "Categories", to: "/admin/categories", icon: FolderTree },
      { label: "Customers", to: "/admin/customers", icon: Users },
      { label: "Discounts (coupon codes)", to: "/admin/coupons", icon: Percent },
      { label: "Newsletter subscribers", to: "/admin/subscribers", icon: Mail },
      { label: "Reels (home page videos)", to: "/admin/reels", icon: Clapperboard },
      { label: "Media (pictures, videos, PDFs)", to: "/admin/media", icon: Images },
      { label: "Abandoned carts", to: "/admin/abandoned", icon: ShoppingBasket },
      { label: "Emails (templates, addresses)", to: "/admin/emails", icon: MailCheck },
      { label: "Blog posts", to: "/admin/blogs", icon: Newspaper },
      { label: "Policies", to: "/admin/policies", icon: ShieldCheck },
      { label: "Header & footer editor", to: "/admin/layout/header", icon: PanelTop },
      { label: "Store features (cart, checkout…)", to: "/admin/commerce", icon: SlidersHorizontal },
      { label: "Theme colours (premium palettes)", to: "/admin/theme", icon: Palette },
      { label: "Product cards (card design, quick view)", to: "/admin/appearance", icon: LayoutGrid },
      { label: "Integrations (Google Analytics, Tag Manager, reCAPTCHA, Razorpay, Clarity)", to: "/admin/integrations", icon: Plug },
      { label: "Account & security", to: "/admin/settings", icon: Settings },
      { label: "Help", to: "/admin/help", icon: LifeBuoy },
    ],
    [],
  );
  // Payment keys and connected services are for the main administrator only.
  const pages = isSuper ? allPages : allPages.filter((p) => p.to !== "/admin/integrations" && p.to !== "/admin/notifications" && p.to !== "/admin/settings");
  const t = term.trim().toLowerCase();
  const orderNo = /^#?\d{3,}$/.test(t) ? t.replace("#", "") : null;
  const hits = t ? pages.filter((p) => p.label.toLowerCase().includes(t)) : pages.slice(0, 6);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(to: string, search?: Record<string, string>) {
    setOpen(false);
    setTerm("");
    if (isSettingsPath(to)) {
      onSettings(to);
      return;
    }
    void navigate({ to, ...(search ? { search } : {}) } as never);
  }

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/60" />
      <input
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (orderNo) go("/admin/orders", { q: orderNo });
            else if (hits[0]) go(hits[0].to);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search pages or an order number"
        aria-label="Search the admin"
        className="w-full rounded-lg border-0 bg-white/15 py-1.5 pl-9 pr-3 text-[13px] text-white placeholder:text-white/60 focus:bg-white focus:text-[#303030] focus:outline-none focus:placeholder:text-[#8a8a8a]"
      />
      {open ? (
        <ul className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-xl border border-[#e3e3e3] bg-white py-1 text-[13px] text-[#303030] shadow-lg">
          {orderNo ? (
            <li><button type="button" onClick={() => go("/admin/orders", { q: orderNo })} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#f1f1f1]"><ShoppingCart className="size-4" /> Find order #{orderNo}</button></li>
          ) : null}
          {hits.map((p) => (
            <li key={p.to}>
              <button type="button" onClick={() => go(p.to)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#f1f1f1]")}>
                <p.icon className="size-4 text-[#616161]" /> {p.label}
              </button>
            </li>
          ))}
          {!hits.length && !orderNo ? <li className="px-3 py-2 text-[#616161]">No matches</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
