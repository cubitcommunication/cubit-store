import { brand } from "@/config/brand";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { SiteLayout } from "../components/site/SiteLayout";
import { PasswordGate } from "../components/site/PasswordGate";
import { Toaster } from "../components/ui/sonner";
import { CartProvider } from "../lib/cart";
import { WishlistProvider } from "../lib/wishlist";
import { QuickViewProvider } from "../components/site/QuickView";
import { siteMediaQuery } from "../lib/site-media";
import { useEffect } from "react";
import { setRecaptchaSiteKey } from "../lib/recaptcha";
import { siteNavQuery, siteSettingsQuery, useSiteTextExact } from "../lib/site-settings";
import { useThemeCss } from "../lib/theme";

function NotFoundComponent() {
  return (
    <>
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-center px-4 py-28 text-center sm:px-6 lg:px-10 lg:py-40">
        <p className="eyebrow text-brand-red">404</p>
        <h1 className="mt-4 max-w-2xl font-display text-3xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          LOOKS LIKE THIS PIECE ISN'T HERE.
        </h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          The page or product you were looking for may have moved or is no longer
          published.
        </p>
        <Link
          to="/"
          className="eyebrow mt-9 bg-foreground px-8 py-4 text-background transition-colors hover:bg-brand-red"
        >
          BACK TO {brand.name}
        </Link>
      </div>
    </>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Static tags (charset, fonts, analytics) live in index.html. This is the
  // default title/description; each page overrides it with its own head().
  head: () => ({
    meta: [
      { title: brand.name },
      {
        name: "description",
        content:
          "Quality products, honest prices and fast delivery.",
      },
      { property: "og:site_name", content: brand.name },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#000000" },
    ],
  }),
  loader: async ({ context }) => {
    // Website banner/editorial images are database-driven; prefetch so SSR
    // renders the currently active image with no flash.
    const [siteMedia, siteSettings, siteNav] = await Promise.all([
      context.queryClient.ensureQueryData(siteMediaQuery()).catch(() => []),
      context.queryClient.ensureQueryData(siteSettingsQuery()).catch(() => []),
      context.queryClient.ensureQueryData(siteNavQuery()).catch(() => []),
    ]);
    return { siteMedia, siteSettings, siteNav };
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/** Hands the reCAPTCHA site key (Admin → Integrations) to the form helpers. */
function IntegrationsBridge() {
  const key = useSiteTextExact()("recaptcha_site_key");
  useEffect(() => setRecaptchaSiteKey(key), [key]);
  return null;
}

/** Applies the colour theme chosen in Admin → Theme colours. */
function ThemeStyle() {
  const css = useThemeCss();
  return css ? <style id="shop-theme" dangerouslySetInnerHTML={{ __html: css }} /> : null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <HeadContent />
      <ThemeStyle />
      <IntegrationsBridge />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <PasswordGate>
        <CartProvider>
          <WishlistProvider>
            <QuickViewProvider>
              <SiteLayout>
                <Outlet />
              </SiteLayout>
            </QuickViewProvider>
          </WishlistProvider>
        </CartProvider>
      </PasswordGate>
      <Toaster />
    </QueryClientProvider>
  );
}
