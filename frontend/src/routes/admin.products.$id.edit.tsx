import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProductForm } from "@/components/admin/ProductForm";
import { adminProductQuery } from "@/lib/admin";
import { exportProductsCsv } from "@/lib/bulk.functions";
import { downloadTextFile } from "@/lib/csv";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/products/$id/edit")({
  head: () => ({ meta: [{ title: `Edit product — ${brand.name} Admin` }] }),
  component: EditProduct,
});

function EditProduct() {
  const { id } = Route.useParams();
  const { data, isPending, isError, refetch } = useQuery(adminProductQuery(id));
  const exportCsv = exportProductsCsv;

  async function downloadCsv() {
    try {
      const { csv } = await exportCsv({ data: { id } });
      downloadTextFile(`${data?.sku || data?.slug || "product"}.csv`, csv);
    } catch {
      toast.error("Download failed. Please try again.");
    }
  }

  return (
    <AdminShell
      title="Edit product"
      back={{ to: "/admin/products", label: "Products" }}
      actions={
        data ? (
          <button
            type="button"
            onClick={() => void downloadCsv()}
            className="eyebrow inline-flex items-center gap-1.5 border border-border px-4 py-3 hover:border-brand-red"
          >
            <Download className="size-3.5" /> Download CSV
          </button>
        ) : null
      }
    >
      {isPending ? (
        <FormSkeleton cards={3} fields={4} />
      ) : isError ? (
        <div className="border border-border bg-background p-6 text-sm">
          <p>Something went wrong. Please try again.</p>
          <button
            onClick={() => void refetch()}
            className="mt-3 border border-border px-3 py-1.5"
          >
            Retry
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm">That product no longer exists.</p>
      ) : (
        <ProductForm product={data} />
      )}
    </AdminShell>
  );
}
