import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export type TagCount = { tag: string; count: number };

/** Every tag in use, with how many products carry it. */
export const tagsQuery = () => ({
  queryKey: ["admin", "tags"] as const,
  queryFn: () => api<{ tags: TagCount[] }>("/admin/tags"),
  staleTime: 15_000,
});

const MAX_TAGS = 30;
const MAX_LEN = 30;

/** One tag the way the server stores it: single spaces, no commas, short. */
export const cleanTag = (raw: string) => raw.replace(/[,;\s]+/g, " ").trim().slice(0, MAX_LEN);

/**
 * Tag chips with a text box. Type a tag and press Enter or comma to add it; click a suggestion
 * to reuse a tag you already have. Used in the product form.
 */
export function TagInput({ value, onChange, className }: { value: string[]; onChange: (next: string[]) => void; className?: string }) {
  const [text, setText] = useState("");
  const known = useQuery(tagsQuery());

  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const add = (raw: string) => {
    const t = cleanTag(raw);
    if (!t || has(t) || value.length >= MAX_TAGS) return;
    onChange([...value, t]);
  };
  const commit = () => {
    text.split(/[,;]/).forEach(add);
    setText("");
  };

  const suggestions = (known.data?.tags ?? []).filter((t) => !has(t.tag) && (!text.trim() || t.tag.toLowerCase().includes(text.trim().toLowerCase()))).slice(0, 12);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background p-2 focus-within:border-brand-red">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#ebebeb] py-0.5 pl-2.5 pr-1 text-[13px] text-[#303030]">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="flex size-4 items-center justify-center rounded-full hover:bg-black/15">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]$/.test(v)) {
              v.split(/[,;]/).forEach(add);
              setText("");
            } else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text.trim() && commit()}
          maxLength={MAX_LEN + 1}
          placeholder={value.length ? "Add another tag" : "Type a tag, e.g. sale, diwali-offer"}
          aria-label="Add a tag"
          disabled={value.length >= MAX_TAGS}
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-1 text-sm focus:outline-none"
        />
      </div>
      {suggestions.length ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Your tags:</span>
          {suggestions.map((t) => (
            <button
              key={t.tag}
              type="button"
              onClick={() => add(t.tag)}
              className={cn("rounded-full border border-border px-2 py-0.5 text-xs text-[#303030] hover:border-brand-red hover:text-brand-red")}
            >
              + {t.tag}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  );
}
