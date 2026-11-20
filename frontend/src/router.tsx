import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RoutePending } from "@/components/ui/route-pending";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      // Whatever is saved in the admin (a category, a collection, a product, a menu item...) can change what other forms
      // and the shop list. Public lists are kept for five minutes, so without this a new category would not show up in
      // the collection form until the cache expired. Only pages that are open refetch; the rest are just marked stale.
      onSuccess: () => {
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
          void queryClient.invalidateQueries();
        }
      },
    }),
  });

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // A page whose data takes a moment shows a skeleton instead of staying blank (only after 300 ms, so quick pages don't flash).
    defaultPendingMs: 300,
    defaultPendingMinMs: 300,
    defaultPendingComponent: RoutePending,
  });
};
