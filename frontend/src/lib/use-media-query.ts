import { useSyncExternalStore } from "react";

/** True while the browser window matches a CSS media query, e.g. "(min-width: 1024px)". */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", listener);
      return () => m.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
