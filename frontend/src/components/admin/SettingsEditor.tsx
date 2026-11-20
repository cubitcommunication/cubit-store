import { useEffect, useState } from "react";
import type { SiteSetting } from "@/lib/site-settings";

const field =
  "mt-1 w-full border border-border bg-background px-3 py-2 text-sm focus:border-brand-red focus:outline-none";

/** Simple label + text box editor for a group of website text settings. */
export function SettingsEditor({
  rows,
  saving,
  onSave,
}: {
  rows: SiteSetting[];
  saving: boolean;
  onSave: (values: Record<string, string>) => void | Promise<void>;
}) {
  const initial = () =>
    Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  const [draft, setDraft] = useState<Record<string, string>>(initial);

  useEffect(() => {
    setDraft(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }, [rows]);

  const dirty = rows.some((r) => (draft[r.key] ?? "") !== r.value);

  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        const changed: Record<string, string> = {};
        for (const r of rows) {
          const value = draft[r.key] ?? "";
          if (value !== r.value) changed[r.key] = value;
        }
        void onSave(changed);
      }}
    >
      <div className="grid gap-5 border border-border bg-background p-6 lg:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className={r.multiline ? "lg:col-span-2" : undefined}>
            <label htmlFor={`s-${r.key}`} className="eyebrow block">
              {r.label}
            </label>
            {r.multiline ? (
              <textarea
                id={`s-${r.key}`}
                rows={3}
                value={draft[r.key] ?? ""}
                onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                className={field}
              />
            ) : (
              <input
                id={`s-${r.key}`}
                type="text"
                value={draft[r.key] ?? ""}
                onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                className={field}
              />
            )}
            {r.help ? (
              <p className="mt-1 text-xs text-muted-foreground">{r.help}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="eyebrow bg-foreground px-6 py-3.5 text-background transition-colors hover:bg-brand-red disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => setDraft(initial())}
          disabled={saving || !dirty}
          className="eyebrow border border-border px-4 py-3.5 transition-colors hover:border-brand-red hover:text-brand-red disabled:opacity-50"
        >
          Undo
        </button>
        {dirty ? (
          <span className="text-xs text-brand-red">Unsaved changes</span>
        ) : null}
      </div>
    </form>
  );
}
