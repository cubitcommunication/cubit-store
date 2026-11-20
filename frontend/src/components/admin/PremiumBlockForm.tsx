import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Btn, Field, IconBtn, adminInput } from "@/components/admin/ui";
import { ImageField, LinkField } from "@/components/admin/PageBlockForms";
import { PREMIUM, type FieldSpec, type PremiumBlock, type PremiumProps } from "@/lib/premium-blocks";

/**
 * The editor panel of every premium element. It is drawn from the field list in lib/premium-blocks.ts, so a new
 * element needs no form code of its own.
 */

type Set = (patch: PremiumProps) => void;

function FieldInput({ spec, value, set }: { spec: FieldSpec; value: unknown; set: (v: unknown) => void }) {
  const text = value == null ? "" : String(value);
  switch (spec.kind) {
    case "text":
      return (
        <Field label={spec.label} {...(spec.help ? { help: spec.help } : {})}>
          <input className={adminInput} maxLength={spec.max ?? 200} value={text} onChange={(e) => set(e.target.value)} />
        </Field>
      );
    case "textarea":
      return (
        <Field label={spec.label} {...(spec.help ? { help: spec.help } : {})}>
          <textarea className={adminInput} rows={spec.rows ?? 3} maxLength={spec.max ?? 500} value={text} onChange={(e) => set(e.target.value)} />
        </Field>
      );
    case "number":
      return (
        <Field label={spec.label} {...(spec.help ? { help: spec.help } : {})}>
          <input
            className={adminInput}
            type="number"
            min={spec.min}
            max={spec.max}
            step={spec.step ?? "any"}
            value={text}
            onChange={(e) => set(e.target.value === "" ? "" : Math.min(spec.max, Math.max(spec.min, Number(e.target.value))))}
          />
        </Field>
      );
    case "select":
      return (
        <Field label={spec.label}>
          <select className={adminInput} value={text} onChange={(e) => set(e.target.value)}>
            {spec.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      );
    case "image":
      return <ImageField label={spec.label} value={text} onChange={(u) => set(u)} />;
    case "link":
      return <LinkField label={spec.label} value={text} onChange={(v) => set(v)} />;
    case "toggle":
      return (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
          {spec.label}
        </label>
      );
    case "datetime":
      return (
        <Field label={spec.label} {...(spec.help ? { help: spec.help } : {})}>
          <input className={adminInput} type="datetime-local" value={text} onChange={(e) => set(e.target.value)} />
        </Field>
      );
    case "list": {
      const items = (Array.isArray(value) ? value : []) as PremiumProps[];
      const max = spec.max ?? 20;
      const move = (i: number, by: number) => {
        const next = [...items];
        const to = i + by;
        if (to < 0 || to >= next.length) return;
        [next[i], next[to]] = [next[to]!, next[i]!];
        set(next);
      };
      return (
        <div className="space-y-2">
          <span className="text-[13px] font-medium">{spec.label} ({items.length})</span>
          {items.map((item, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-[#e3e3e3] p-2.5">
              <p className="text-[12px] font-semibold text-[#616161]">{spec.itemLabel} {i + 1}</p>
              {spec.fields.map((f) => (
                <FieldInput key={f.key} spec={f} value={item[f.key]} set={(v) => set(items.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))} />
              ))}
              <div className="flex justify-end gap-0.5">
                <IconBtn icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconBtn icon={ArrowDown} label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                <IconBtn icon={Trash2} label="Remove" tone="danger" onClick={() => set(items.filter((_, j) => j !== i))} />
              </div>
            </div>
          ))}
          <Btn disabled={items.length >= max} onClick={() => set([...items, JSON.parse(JSON.stringify(spec.blank))])}><Plus className="size-3.5" />Add {spec.itemLabel.toLowerCase()}</Btn>
        </div>
      );
    }
  }
}

export function PremiumBlockForm({ block, onChange }: { block: PremiumBlock; onChange: Set }) {
  const def = PREMIUM[block.type];
  const props = block.props ?? {};
  const set = (key: string) => (v: unknown) => onChange({ props: { ...props, [key]: v } });
  return (
    <>
      {def.fields.map((f) => (
        <FieldInput key={f.key} spec={f} value={props[f.key]} set={set(f.key)} />
      ))}
    </>
  );
}
