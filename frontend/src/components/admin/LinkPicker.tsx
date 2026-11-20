import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { categoriesQuery, collectionsQuery } from "@/lib/catalog";
import { CATEGORY_NAV } from "@/lib/category-nav";
import { OCCASIONS } from "@/config/brand";
import { PAGE_LINKS, isValidLink, occasionLink } from "@/lib/links";
import { adminInput } from "@/components/admin/ui";

const CUSTOM = "__custom__";

/**
 * "Where does it open?" for the admin: pick a page, collection, category or material from a list,
 * or choose "Another address…" and type a site path (/shop?q=Bridal) or an https:// link.
 */
export function LinkPicker({ value, onChange, allowEmpty = false, emptyLabel = "— Nothing —", id }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; emptyLabel?: string; id?: string }) {
  const collections = useQuery(collectionsQuery());
  const categories = useQuery(categoriesQuery());

  const groups = useMemo(
    () => [
      { label: "Pages", items: PAGE_LINKS.map((p) => ({ path: p.path, label: p.label })) },
      { label: "Categories", items: (categories.data?.length ? categories.data.map((c) => ({ slug: c.slug, shortLabel: c.name })) : CATEGORY_NAV).map((c) => ({ path: `/collections/${c.slug}`, label: c.shortLabel })) },
      { label: "Products by occasion", items: OCCASIONS.map((o) => ({ path: occasionLink(o), label: o })) },
      { label: "Collections you created", items: (collections.data ?? []).map((c) => ({ path: `/collection/${c.slug}`, label: c.name })) },
    ],
    [collections.data],
  );
  const known = new Set(groups.flatMap((g) => g.items.map((i) => i.path)));
  const isCustom = value !== "" && !known.has(value);
  const selected = value === "" ? (allowEmpty ? "" : CUSTOM) : isCustom ? CUSTOM : value;
  const invalid = value !== "" && !isValidLink(value);

  return (
    <div className="grid gap-2">
      <select
        id={id}
        className={adminInput}
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) onChange(value && isCustom ? value : "/");
          else onChange(v);
        }}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {groups.map((g) =>
          g.items.length ? (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((i) => <option key={i.path} value={i.path}>{i.label}</option>)}
            </optgroup>
          ) : null,
        )}
        <option value={CUSTOM}>Another address…</option>
      </select>
      {selected === CUSTOM ? (
        <>
          <input className={adminInput} value={value} placeholder="/shop?q=Bridal  or  https://…" onChange={(e) => onChange(e.target.value.trim())} aria-label="Link address" />
          {invalid ? <p className="text-xs text-[#8e1f0b]">Use a page of this site starting with / (for example /collection/wedding-season) or a full https:// address.</p> : null}
        </>
      ) : null}
    </div>
  );
}
