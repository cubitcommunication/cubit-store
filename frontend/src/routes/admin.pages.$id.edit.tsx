import { brand } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageBuilder } from "@/components/admin/PageBuilder";
import { db } from "@/lib/data";
import { PAGE_FIELDS, type PageRow } from "@/lib/pages";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/pages/$id/edit")({
  head: () => ({ meta: [{ title: `Page builder — ${brand.name} Admin` }] }),
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  const { data, isPending, isError } = useQuery({
    queryKey: ["admin", "page", id],
    queryFn: async () => {
      const { data: row, error } = await db.from("pages").select(PAGE_FIELDS).eq("id", id).maybeSingle();
      if (error) throw new Error("PAGE_UNAVAILABLE");
      return row as PageRow | null;
    },
    // The editor owns the draft while it is open; never refetch over it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (isPending) return <div className="admin-ui h-screen bg-[#f1f1f1]"><div className="p-6"><FormSkeleton cards={2} fields={4} /></div></div>;
  if (isError || !data) {
    return (
      <div className="admin-ui flex h-screen flex-col items-center justify-center gap-2 text-[13px]">
        <p>This page could not be found.</p>
        <Link to="/admin/pages" className="text-[#005bd3] underline">Back to pages</Link>
      </div>
    );
  }
  return <PageBuilder key={data.id} page={data} />;
}
