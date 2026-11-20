import { api } from "./api";
import type { ImportMode, ImportPreview, ImportResult } from "./bulk-types";

/** Admin-only bulk product endpoints (CSV export, preview and import). */

export const exportProductsCsv = ({ data }: { data: { id?: string | undefined } }) =>
  api<{ csv: string }>("/admin/bulk/export", { method: "POST", body: data });

export const previewProductImport = ({ data }: { data: { csv: string; mode: ImportMode } }) =>
  api<ImportPreview>("/admin/bulk/preview", { method: "POST", body: data });

export const commitProductImport = ({
  data,
}: {
  data: { csv: string; mode: ImportMode; confirmUpdates?: boolean | undefined };
}) => api<ImportResult>("/admin/bulk/commit", { method: "POST", body: data });
