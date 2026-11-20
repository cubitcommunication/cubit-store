import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import { getRouter } from "./router";
import { installPreviewListener } from "./lib/appearance";
import { trackPageView } from "./lib/analytics";
import { InstallApp } from "./components/install/InstallApp";

const router = getRouter();
installPreviewListener();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// The PHP server pre-renders <title>/<meta> tags (marked data-shop-ssr) so
// crawlers and link previews that do not run JavaScript still see them. Once
// React has rendered its own head tags, the server copies are removed so the
// title and meta never go stale while visitors navigate.
const unsubscribe = router.subscribe("onResolved", () => {
  unsubscribe();
  window.setTimeout(() => {
    document.head.querySelectorAll("[data-shop-ssr]").forEach((node) => node.remove());
  }, 100);
});

// Analytics, Tag Manager and the Meta Pixel see the first page load by themselves; later page changes happen
// inside the app (no reload), so each one is reported here.
let firstPage = true;
router.subscribe("onResolved", (event) => {
  if (firstPage) {
    firstPage = false;
    return;
  }
  if (event.pathChanged) window.setTimeout(() => trackPageView(window.location.pathname, document.title), 50);
});

// A brand-new site (no settings file on the server yet) shows only the installer form.
const installing = (window as unknown as { __INSTALL__?: boolean }).__INSTALL__ === true;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{installing ? <InstallApp /> : <RouterProvider router={router} />}</StrictMode>,
);
