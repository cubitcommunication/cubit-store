/** Shared shapes between the bulk import wizard and the Worker. Client-safe. */

export type ImportRowStatus = "ready" | "update" | "skipped" | "error";

export type ImportPreviewRow = {
  row: number;
  name: string;
  sku: string;
  category: string;
  price: string;
  visibility: string;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  existing: boolean;
  /** True when the row will be saved as a Draft because something is still missing. */
  draft: boolean;
  /** "Price missing", "Material missing", "Images missing". */
  draftReasons: string[];
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  found: number;
  ready: number;
  updates: number;
  warnings: number;
  errors: number;
  drafts: number;
  missingColumns: string[];
  unknownColumns: string[];
  fileErrors: string[];
};

export type ImportResultRow = {
  row: number;
  sku: string;
  name: string;
  outcome: "created" | "updated" | "skipped" | "failed";
  reason: string;
  draft: boolean;
  draftReasons: string[];
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Of the created/updated products, how many were saved as Draft. */
  drafted: number;
  rows: ImportResultRow[];
};

export type ImportMode = "create" | "update";
