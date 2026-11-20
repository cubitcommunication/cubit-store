import { brand } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { CSV_COLUMNS, blankTemplateCsv, downloadTextFile } from "@/lib/csv";
import {
  commitProductImport,
  previewProductImport,
} from "@/lib/bulk.functions";
import type {
  ImportMode,
  ImportPreview,
  ImportResult,
} from "@/lib/bulk-types";

export const Route = createFileRoute("/admin/products/import")({
  head: () => ({ meta: [{ title: `Import products — ${brand.name} Admin` }] }),
  component: ImportProducts,
});

const STEPS = [
  "Upload CSV",
  "Preview & validate",
  "Confirm import",
  "Import complete",
] as const;

function StatusChip({ status }: { status: string }) {
  const label =
    status === "ready"
      ? "✓ Ready"
      : status === "update"
        ? "↻ Update"
        : status === "skipped"
          ? "⚠ Skipped"
          : "✕ Error";
  const tone =
    status === "error"
      ? "border-brand-red text-brand-red"
      : status === "skipped"
        ? "border-border text-muted-foreground"
        : "border-foreground";
  return (
    <span className={`inline-block border px-2 py-0.5 text-xs ${tone}`}>{label}</span>
  );
}

function ImportProducts() {
  const preview = previewProductImport;
  const commit = commitProductImport;

  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<ImportMode>("create");
  const [report, setReport] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUpdates, setConfirmUpdates] = useState(false);

  async function runPreview(text: string, nextMode: ImportMode, name: string) {
    setBusy(true);
    try {
      const data = await preview({ data: { csv: text, mode: nextMode } });
      setCsv(text);
      setFileName(name);
      setReport(data);
      setStep(2);
    } catch {
      toast.error("We could not read that file. Please check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      toast.error(
        "Please save the sheet as CSV first (File → Download → Comma-separated values).",
      );
      return;
    }
    const text = await file.text();
    await runPreview(text, mode, file.name);
  }

  async function changeMode(next: ImportMode) {
    setMode(next);
    setConfirmUpdates(false);
    if (csv) await runPreview(csv, next, fileName);
  }

  async function doImport() {
    setBusy(true);
    try {
      const data = await commit({
        data: { csv, mode, confirmUpdates: mode === "update" ? confirmUpdates : undefined },
      });
      setResult(data);
      setStep(4);
    } catch {
      toast.error("The import could not be completed. Nothing partial was saved.");
    } finally {
      setBusy(false);
    }
  }

  function downloadErrorReport() {
    const rows = (result?.rows ?? []).filter(
      (r) => r.outcome === "failed" || r.outcome === "skipped" || r.reason,
    );
    const header = ["Row", "SKU", "Product Name", "Error", "Reason"];
    const escape = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    const csvText = [
      header.map(escape).join(","),
      ...rows.map((r) =>
        [
          String(r.row),
          r.sku,
          r.name,
          r.outcome === "failed" ? "Failed" : r.outcome === "skipped" ? "Skipped" : "Warning",
          r.reason,
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\r\n");
    downloadTextFile("shop-import-report.csv", csvText);
  }

  const blocked = Boolean(
    report && (report.fileErrors.length || report.ready + report.updates === 0),
  );

  return (
    <AdminShell
      title="Import products"
      actions={
        <Link to="/admin/products" className="eyebrow border border-border px-4 py-3">
          Back to products
        </Link>
      }
    >
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={
              step === index + 1
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            }
          >
            Step {index + 1} — {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="mt-6 max-w-2xl space-y-4 border border-border bg-background p-6">
          <h2 className="font-display text-lg">Step 1 — Upload your CSV</h2>
          <p className="text-sm text-muted-foreground">
            Use the template so the column names match. Nothing is saved until you
            confirm on the next screens.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block text-sm"
            aria-label="Choose a CSV file"
          />
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                "shop-product-template.csv",
                blankTemplateCsv(),
              )
            }
            className="eyebrow border border-border px-4 py-2.5"
          >
            Download CSV template
          </button>
          {busy ? <p className="text-sm text-muted-foreground">Reading file…</p> : null}
          <details className="text-sm">
            <summary className="cursor-pointer">Column names used by this import</summary>
            <ul className="mt-2 list-inside list-disc text-muted-foreground">
              {CSV_COLUMNS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      {step >= 2 && step <= 3 && report ? (
        <section className="mt-6 space-y-5">
          <div className="border border-border bg-background p-5">
            <p className="text-sm">
              File: <strong>{fileName}</strong> · Products found:{" "}
              <strong>{report.found}</strong>
            </p>
            <p className="mt-2 text-sm">
              ✓ Ready to import: <strong>{report.ready}</strong> · ↻ To update:{" "}
              <strong>{report.updates}</strong> · ⚑ Will be Draft:{" "}
              <strong>{report.drafts}</strong> · ⚠ Warnings:{" "}
              <strong>{report.warnings}</strong> · ✕ Errors:{" "}
              <strong className={report.errors ? "text-brand-red" : ""}>
                {report.errors}
              </strong>
            </p>
            {report.fileErrors.length ? (
              <ul className="mt-3 list-inside list-disc text-sm text-brand-red">
                {report.fileErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            {report.unknownColumns.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Ignored extra columns: {report.unknownColumns.join(", ")}
              </p>
            ) : null}
          </div>

          <fieldset className="border border-border bg-background p-5">
            <legend className="eyebrow px-2">Duplicate SKU handling</legend>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "create"}
                  onChange={() => void changeMode("create")}
                />
                <span>
                  <strong>Create new products only</strong> (default) — rows whose SKU
                  already exists are skipped and nothing existing is changed.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "update"}
                  onChange={() => void changeMode("update")}
                />
                <span>
                  <strong>Update existing products</strong> — matching SKUs are updated
                  with the values in this file. Blank cells keep the current value.
                </span>
              </label>
            </div>
          </fieldset>

          <div className="overflow-x-auto border border-border bg-background">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Row</th>
                  <th className="p-3">Product name</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Visibility</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.row} className="border-b border-border last:border-0">
                    <td className="p-3">{row.row}</td>
                    <td className="p-3">{row.name || "—"}</td>
                    <td className="p-3">{row.sku || "—"}</td>
                    <td className="p-3">{row.category || "—"}</td>
                    <td className="p-3">{row.price || "—"}</td>
                    <td className="p-3">{row.visibility}</td>
                    <td className="p-3">
                      <StatusChip status={row.status} />
                    </td>
                    <td className="p-3 text-xs">
                      {row.errors.map((e) => (
                        <p key={e} className="text-brand-red">
                          {e}
                        </p>
                      ))}
                      {row.warnings.map((w) => (
                        <p key={w} className="text-muted-foreground">
                          {w}
                        </p>
                      ))}
                      {!row.errors.length && !row.warnings.length ? "—" : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {step === 2 ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={blocked}
                onClick={() => setStep(3)}
                className="eyebrow bg-foreground px-6 py-4 text-background hover:bg-brand-red disabled:opacity-50"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setReport(null);
                  setCsv("");
                }}
                className="eyebrow border border-border px-6 py-4"
              >
                Upload a different file
              </button>
              {blocked ? (
                <p className="self-center text-sm text-brand-red">
                  Fix the rows above in your spreadsheet, then upload the file again.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 border border-border bg-background p-5">
              <h2 className="font-display text-lg">Step 3 — Confirm import</h2>
              <p className="text-sm">
                {report.ready} product{report.ready === 1 ? "" : "s"} will be created
                {mode === "update" && report.updates
                  ? `, ${report.updates} existing product${report.updates === 1 ? "" : "s"} will be updated`
                  : ""}
                . Rows with errors are never imported.
              </p>
              {mode === "update" ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmUpdates}
                    onChange={(e) => setConfirmUpdates(e.target.checked)}
                  />
                  Yes, update the existing products listed above.
                </label>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy || (mode === "update" && !confirmUpdates)}
                  onClick={() => void doImport()}
                  className="eyebrow bg-foreground px-6 py-4 text-background hover:bg-brand-red disabled:opacity-50"
                >
                  {busy ? "Importing…" : "Import products"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="eyebrow border border-border px-6 py-4"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {step === 4 && result ? (
        <section className="mt-6 max-w-2xl space-y-4 border border-border bg-background p-6">
          <h2 className="font-display text-lg">Import completed</h2>
          <ul className="text-sm">
            <li>
              Imported successfully:{" "}
              {result.created + result.updated - result.drafted}
            </li>
            <li>Imported as Draft: {result.drafted}</li>
            <li>Failed: {result.failed}</li>
            {result.skipped ? <li>Skipped: {result.skipped}</li> : null}
          </ul>
          {result.rows.some((r) => r.draft || r.outcome === "failed") ? (
            <div className="space-y-2 text-sm">
              {result.rows
                .filter((r) => r.draft)
                .map((r) => (
                  <p key={`d-${r.row}`} className="text-muted-foreground">
                    Row {r.row} — {r.name || r.sku}: saved as Draft (
                    {r.draftReasons.join(", ") || "needs review"})
                  </p>
                ))}
              {result.rows
                .filter((r) => r.outcome === "failed")
                .map((r) => (
                  <p key={`f-${r.row}`} className="text-brand-red">
                    Row {r.row} — {r.name || r.sku}: {r.reason}
                  </p>
                ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Link
              to="/admin/products"
              className="eyebrow bg-foreground px-6 py-4 text-background hover:bg-brand-red"
            >
              View products
            </Link>
            <button
              type="button"
              onClick={downloadErrorReport}
              className="eyebrow border border-border px-6 py-4"
            >
              Download error report
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setReport(null);
                setResult(null);
                setCsv("");
                setFileName("");
                setMode("create");
                setConfirmUpdates(false);
              }}
              className="eyebrow border border-border px-6 py-4"
            >
              Import another file
            </button>
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}
