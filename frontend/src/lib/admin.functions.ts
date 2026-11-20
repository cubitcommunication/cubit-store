import { api } from "./api";

/** Admin-only catalogue export used by the backup screen. */
export const exportCatalogue = () =>
  api<{ exportedAt: string; products: Record<string, unknown>[] }>("/admin/export-catalogue");
