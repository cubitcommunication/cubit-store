import { brand } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutEditor } from "@/components/admin/LayoutEditor";
import { layoutFromSettings } from "@/lib/layout";
import { fetchSiteSettings, SETTING_DEFAULTS } from "@/lib/site-settings";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/layout/$kind")({
  head: () => ({ meta: [{ title: `Header & footer — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: LayoutPage,
});

function LayoutPage() {
  const { kind } = Route.useParams();
  const { data, isPending, isError } = useQuery({
    queryKey: ["admin", "layout-settings"],
    queryFn: fetchSiteSettings,
    // The editor owns the draft while it is open; never refetch over it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (kind !== "header" && kind !== "footer") {
    return (
      <div className="admin-ui flex h-screen flex-col items-center justify-center gap-2 text-[13px]">
        <p>Unknown layout.</p>
        <Link to="/admin/layout/$kind" params={{ kind: "header" }} className="text-[#005bd3] underline">Open the header editor</Link>
      </div>
    );
  }
  if (isPending) return <div className="admin-ui h-screen bg-[#f1f1f1]"><div className="p-6"><FormSkeleton cards={2} fields={4} /></div></div>;
  if (isError) return <div className="admin-ui flex h-screen items-center justify-center text-[13px]">Could not load the settings. Please refresh.</div>;
  const layouts = layoutFromSettings(data);
  // First time: copy the old announcement lines (the old Seasonal campaign settings) into the header design, which owns them from now on.
  if (!layouts.header.announce) {
    const get = (k: string) => (data?.find((r) => r.key === k)?.value ?? "").trim();
    layouts.header.announce = {
      items: [
        { text: get("announcement") || SETTING_DEFAULTS["announcement"] || "", url: get("announcement_url") },
        { text: get("announcement_2"), url: get("announcement_2_url") },
      ].filter((i) => i.text),
    };
  }
  return <LayoutEditor key={kind} kind={kind} initial={layouts[kind]} />;
}
