/**
 * Shared CSV contract for the admin bulk product import / export.
 *
 * The column names below are the stable, documented interface: the export, the
 * blank template, the single-product download and the importer all use exactly
 * these headers, in this order. Nothing here talks to the database, so the file
 * is safe to import from both the browser and the Worker.
 */

export const CSV_COLUMNS = [
  "Product Name",
  "SKU",
  "Slug",
  "Price",
  "Category",
  "Material",
  "Collection",
  "Subcategory",
  "Short Description",
  "Description",
  "Where to Wear",
  "Occasions",
  "Visibility",
  "Featured",
  "New Arrival",
  "SEO Title",
  "SEO Description",
  "Social Image URL",
  "Primary Image URL",
  "Additional Image URLs",
  "Image Alt Text",
  "WhatsApp Enquiry Message",
  "Option Name",
  "Variants",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type CsvRecord = Partial<Record<CsvColumn, string>> & Record<string, string>;

/** Rows whose product name starts with this marker are never imported. */
export const EXAMPLE_MARKER = "EXAMPLE";

/* --------------------------------------------------------------- parsing */

/** RFC 4180 parser: handles quotes, escaped quotes, embedded newlines, CRLF. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else quoted = false;
      } else value += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
continue;
    }
    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(value);
      value = "";
      rows.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  row.push(value);
  rows.push(row);

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Turns a parsed matrix into header-keyed records. */
export function parseCsvRecords(input: string): {
  records: CsvRecord[];
  missingColumns: string[];
  unknownColumns: string[];
} {
  const matrix = parseCsv(input);
  const header = (matrix[0] ?? []).map((h) => h.trim());
  const known = new Set<string>(CSV_COLUMNS);
  const present = new Set(header);

  const records = matrix.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = (cells[index] ?? "").trim();
    });
    return record as CsvRecord;
  });

  return {
    records,
    missingColumns: CSV_COLUMNS.filter((c) => !present.has(c)),
    unknownColumns: header.filter((h) => h && !known.has(h)),
  };
}

/* ------------------------------------------------------------ serialising */

/**
 * Neutralises spreadsheet formula injection. A leading =, +, -, @, tab or
 * carriage return is prefixed with an apostrophe so Excel treats it as text.
 */
export function sanitizeCsvCell(value: unknown): string {
  const raw =
    value == null
      ? ""
      : Array.isArray(value)
        ? value.join(", ")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  const risky = /^[=+\-@\t\r]/.test(raw);
  const text = risky ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(records: Record<string, unknown>[]): string {
  const header = CSV_COLUMNS.map((c) => sanitizeCsvCell(c)).join(",");
  const body = records.map((record) =>
    CSV_COLUMNS.map((column) => sanitizeCsvCell(record[column])).join(","),
  );
  return [header, ...body].join("\r\n");
}

/** Blank template: headers plus one clearly-marked example row. */
export function blankTemplateCsv(): string {
  return buildCsv([
    {
      "Product Name": "EXAMPLE — delete this row before importing",
      SKU: "EXAMPLE-001",
      Slug: "example-product",
      Price: "1499",
      Category: "Category name",
      Material: "Anti-Tarnish",
      Collection: "",
      Subcategory: "",
      "Short Description": "One line shown in listings.",
      Description: "Full product description.",
      "Where to Wear": "Festive evenings and family functions",
      Occasions: "Everyday, Party",
      Visibility: "Draft",
      Featured: "FALSE",
      "New Arrival": "TRUE",
      "SEO Title": "",
      "SEO Description": "",
      "Social Image URL": "",
      "Primary Image URL": "https://example.com/image1.jpg",
      "Additional Image URLs":
        "https://example.com/image2.jpg,https://example.com/image3.jpg",
      "Image Alt Text": "",
      "WhatsApp Enquiry Message": "",
    },
  ]);
}

/* ----------------------------------------------------------- value helpers */

export function parseBoolean(value: string | undefined): boolean | null {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return false;
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return null;
}

export function parseVisibility(value: string | undefined): boolean | null {
  const text = (value ?? "").trim().toLowerCase();
  if (!text || text === "draft") return false;
  if (text === "published") return true;
  return null;
}

export function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function isValidHttpUrl(value: string): boolean {
  if (value.startsWith("/api/public/img/") || value.startsWith("/images/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function slugifyValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Browser helper: triggers a download for generated text. */
export function downloadTextFile(filename: string, text: string, type = "text/csv") {
  const blob = new Blob([`\uFEFF${text}`], { type: `${type};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
