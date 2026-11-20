import { useRouterState } from "@tanstack/react-router";
import {
  AdminTitleSkeleton, DashboardSkeleton, FormSkeleton, OrderSkeleton, ReportSkeleton, TableSkeleton, TilesSkeleton,
} from "@/components/ui/loading-rows";

const ADMIN_TABLES: [RegExp, { cols: number; thumb?: boolean }][] = [
  [/^\/admin\/orders\/?$/, { cols: 6 }],
  [/^\/admin\/products\/?$/, { cols: 6, thumb: true }],
  [/^\/admin\/(customers|coupons|abandoned|returns|inventory|subscribers|tags|categories|collections|blogs|pages|policies)/, { cols: 5 }],
];

/**
 * What a page shows while it loads (after a short delay). The shape follows the page that is opening, so the placeholder
 * looks like the real content: a table for lists, cards for settings, a grid for products, and so on.
 */
export function RoutePending() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (path.startsWith("/admin")) {
    let body: React.ReactNode = <FormSkeleton cards={2} fields={4} />;
    const table = ADMIN_TABLES.find(([re]) => re.test(path));
    if (/^\/admin\/orders\/[^/]+/.test(path)) body = <OrderSkeleton />;
    else if (/^\/admin\/dashboard/.test(path)) body = <DashboardSkeleton />;
    else if (/^\/admin\/reports/.test(path)) body = <ReportSkeleton />;
    else if (/^\/admin\/(media|reels)/.test(path)) body = <TilesSkeleton />;
    else if (table) body = <div className="overflow-hidden rounded-[12px] border border-[#e3e3e3] bg-white"><TableSkeleton rows={9} cols={table[1].cols} thumb={table[1].thumb ?? false} /></div>;
    return <div className="admin-ui p-4 sm:p-6"><AdminTitleSkeleton />{body}</div>;
  }

  // Storefront: no placeholder page. The header and footer stay, and each section shows its own soft loading state.
  return null;
}
