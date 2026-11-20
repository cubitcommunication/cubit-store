import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { exportCatalogue } from "@/lib/admin.functions";
import { toCsv } from "@/lib/admin";

export const Route = createFileRoute("/admin/backup")({
  head: () => ({ meta: [{ title: `Export & backup — ${brand.name} Admin` }] }),
  component: Backup,
});

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Backup() {
  const runExport = exportCatalogue;
  const [busy, setBusy] = useState<"csv" | "json" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(kind: "csv" | "json") {
    setBusy(kind);
    setError(null);
    try {
      const result = await runExport();
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "json") {
        download(
          `shop-catalogue-${stamp}.json`,
          JSON.stringify(result, null, 2),
          "application/json",
        );
      } else {
        const rows = result.products.map((p: any) => ({
          name: p.name,
          sku: p.sku,
          price: p.price,
          category: p.category,
          subcategory: p.subcategory,
          material: p.material,
          description: p.description,
          occasion: p.occasion,
          where_to_wear: p.where_to_wear,
          featured: p.featured,
          new_arrival: p.new_arrival,
          published: p.published,
          archived_at: p.archived_at,
          images: (p.product_images ?? [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((i: any) => i.image_url)
            .join(" | "),
          created_at: p.created_at,
          updated_at: p.updated_at,
        }));
        download(`shop-catalogue-${stamp}.csv`, toCsv(rows), "text/csv");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="Export & backup">
      <div className="max-w-2xl border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">
          Download a full copy of the product catalogue, including image
          references. Keep a copy outside the hosting platform so the catalogue
          can always be restored.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => void handle("csv")}
            disabled={busy !== null}
            className="eyebrow bg-foreground px-5 py-3 text-background hover:bg-brand-red disabled:opacity-60"
          >
            {busy === "csv" ? "Preparing…" : "Export CSV"}
          </button>
          <button
            onClick={() => void handle("json")}
            disabled={busy !== null}
            className="eyebrow border border-border px-5 py-3 hover:border-brand-red hover:text-brand-red disabled:opacity-60"
          >
            {busy === "json" ? "Preparing…" : "Export JSON"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-brand-red">
            {error}
          </p>
        ) : null}
      </div>
    </AdminShell>
  );
}
