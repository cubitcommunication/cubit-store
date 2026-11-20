import { describe, expect, it } from "vitest";
import { HOME_TEMPLATES } from "./home-templates";
import { BLOCK_LABELS, LIBRARY, NOT_IN_COLUMNS, SELF_CONTAINED, blankBlock, type Block } from "./pages";
import { PREMIUM, PREMIUM_TYPES, TRUST_ICONS, isPremiumType, premiumBlank, type FieldSpec } from "./premium-blocks";

const keysOf = (fields: FieldSpec[]) => fields.map((f) => f.key);

function allBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((b) => (b.type === "columns" ? [b, ...allBlocks(b.columns.flat())] : [b]));
}

describe("premium elements", () => {
  it("every element is fully described", () => {
    for (const type of PREMIUM_TYPES) {
      const def = PREMIUM[type];
      expect(def.label, type).toBeTruthy();
      expect(def.help, type).toBeTruthy();
      expect(def.fields.length, type).toBeGreaterThan(0);
      const keys = keysOf(def.fields);
      expect(new Set(keys).size, `${type} has a repeated field`).toBe(keys.length);
      // The starting content only uses fields the editor can show, and every field has a starting value.
      expect(Object.keys(def.defaults).sort(), type).toEqual([...keys].sort());
      for (const f of def.fields) {
        if (f.kind === "list") {
          const inner = keysOf(f.fields);
          expect(Object.keys(f.blank).sort(), `${type}.${f.key} blank item`).toEqual([...inner].sort());
          for (const item of def.defaults[f.key] as Record<string, unknown>[]) expect(Object.keys(item).sort(), `${type}.${f.key} default item`).toEqual([...inner].sort());
        }
        if (f.kind === "select") expect(f.options.map(([v]) => v), `${type}.${f.key}`).toContain(String(def.defaults[f.key]));
      }
    }
  });

  it("each is known to the builder: label, library, own spacing, never inside columns", () => {
    const inLibrary = new Set(LIBRARY.flatMap((g) => g.items.map((i) => i.type)));
    for (const type of PREMIUM_TYPES) {
      expect(BLOCK_LABELS[type].label, type).toBe(PREMIUM[type].label);
      expect(inLibrary.has(type), `${type} is in the Add section list`).toBe(true);
      expect(SELF_CONTAINED.has(type), type).toBe(true);
      expect(NOT_IN_COLUMNS.includes(type), type).toBe(true);
    }
    expect(isPremiumType("hero")).toBe(false);
    expect(isPremiumType("p_stats")).toBe(true);
  });

  it("new blocks are copies with their own id, so editing one never changes another", () => {
    const a = premiumBlank("p_testimonials");
    const b = blankBlock("p_testimonials") as unknown as ReturnType<typeof premiumBlank>;
    expect(a.id).not.toBe(b.id);
    expect(b.type).toBe("p_testimonials");
    a.props.items[0].name = "Changed";
    expect(premiumBlank("p_testimonials").props.items[0].name).not.toBe("Changed");
    expect(b.props.items[0].name).not.toBe("Changed");
  });

  it("trust badge icons offered in the editor all have a name", () => {
    expect(TRUST_ICONS.length).toBeGreaterThanOrEqual(8);
    for (const [value, label] of TRUST_ICONS) expect(value && label).toBeTruthy();
  });
});

describe("home templates", () => {
  it("there are five, each with its own name", () => {
    expect(HOME_TEMPLATES).toHaveLength(5);
    expect(new Set(HOME_TEMPLATES.map((t) => t.id)).size).toBe(5);
    expect(new Set(HOME_TEMPLATES.map((t) => t.name)).size).toBe(5);
  });

  it("each builds a page of valid sections with unique ids and only fields the editor knows", () => {
    for (const t of HOME_TEMPLATES) {
      const blocks = t.build();
      expect(blocks.length, t.id).toBeGreaterThanOrEqual(5);
      const flat = allBlocks(blocks);
      expect(new Set(flat.map((b) => b.id)).size, `${t.id} block ids`).toBe(flat.length);
      expect(blocks.some((b) => isPremiumType(b.type)), `${t.id} uses premium elements`).toBe(true);
      expect(t.outline.length, t.id).toBe(blocks.length);
      for (const b of flat) {
        expect(BLOCK_LABELS[b.type], `${t.id}: unknown block ${b.type}`).toBeDefined();
        if (isPremiumType(b.type)) {
          const known = keysOf(PREMIUM[b.type].fields);
          for (const k of Object.keys((b as unknown as { props: object }).props)) expect(known, `${t.id}/${b.type}.${k}`).toContain(k);
        }
      }
    }
  });

  it("building twice gives fresh ids (applying a template twice never clashes)", () => {
    const t = HOME_TEMPLATES[0]!;
    const a = t.build().map((b) => b.id);
    const b = t.build().map((x) => x.id);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });
});
