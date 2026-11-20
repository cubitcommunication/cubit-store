import { brand } from "@/config/brand";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/admin")({
  // The session cookie is checked per request, so the admin panel is client-rendered.
  ssr: false,
  head: () => ({
    meta: [
      { title: `${brand.name} Admin` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { loading, isAdmin, refresh } = useAdminAuth();

  if (loading) {
    return (
      <div className="admin-ui min-h-screen bg-[#f1f1f1]" role="status" aria-busy="true" aria-label="Loading">
        <div className="flex h-14 items-center gap-4 bg-[#1a1a1a] px-4">
          <div className="size-7 skel rounded bg-white/15" />
          <div className="h-8 w-full max-w-md skel rounded-lg bg-white/15" />
        </div>
        <div className="flex">
          <div className="hidden w-56 shrink-0 space-y-3 p-4 md:block">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-5 skel rounded bg-[#e3e3e3]" style={{ width: `${60 + (i % 3) * 15}%` }} />)}
          </div>
          <div className="flex-1 space-y-4 p-4 sm:p-6">
            <div className="h-7 w-1/4 skel rounded bg-[#e3e3e3]" />
            <div className="h-40 skel rounded-[12px] bg-[#e3e3e3]" />
            <div className="h-64 skel rounded-[12px] bg-[#e3e3e3]" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) return <AdminLogin onSignedIn={refresh} />;

  return <Outlet />;
}
