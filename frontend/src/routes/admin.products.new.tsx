import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProductForm } from "@/components/admin/ProductForm";

export const Route = createFileRoute("/admin/products/new")({
  head: () => ({ meta: [{ title: `Add product — ${brand.name} Admin` }] }),
  component: () => (
    <AdminShell title="Add product" back={{ to: "/admin/products", label: "Products" }}>
      <ProductForm />
    </AdminShell>
  ),
});
