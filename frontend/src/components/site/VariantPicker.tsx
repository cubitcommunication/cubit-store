import type { Product } from "@/lib/catalog";
import { swatchColour, valueAvailable, type Selection } from "@/lib/variants";
import { cn } from "@/lib/utils";

/**
 * Option selector for products with variants (Size, Colour…). Colour-like options become round swatches,
 * everything else becomes chips. Sold-out or impossible combinations are crossed out but stay visible.
 */
export function VariantPicker({
  product,
  selection,
  onChange,
  compact = false,
  className,
}: {
  product: Product;
  selection: Selection;
  onChange: (next: Selection) => void;
  compact?: boolean;
  className?: string;
}) {
  const options = product.options ?? [];
  if (!options.length) return null;

  return (
    <div className={cn("space-y-3", className)} id="product-options">
      {options.map((option) => {
        const chosen = selection[option.name];
        return (
          <fieldset key={option.name} className="min-w-0">
            <legend className={cn("mb-1.5 flex items-baseline gap-1.5", compact ? "text-[11px]" : "text-xs")}>
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">{option.name}</span>
              {chosen ? <span className="text-foreground">{chosen}</span> : null}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {option.values.map((value) => {
                const available = valueAvailable(product, selection, option.name, value);
                const selected = chosen === value;
                const colour = swatchColour(option.name, value);
                const pick = (event: React.MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange({ ...selection, [option.name]: selected ? "" : value });
                };
                if (colour) {
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={pick}
                      aria-pressed={selected}
                      aria-label={`${option.name}: ${value}${available ? "" : " (unavailable)"}`}
                      title={value}
                      className={cn(
                        "relative rounded-full border border-border p-0.5 transition-shadow",
                        compact ? "size-6" : "size-8",
                        selected && "ring-2 ring-foreground ring-offset-2",
                        !available && "opacity-40",
                      )}
                    >
                      <span className="block size-full rounded-full" style={{ background: colour }} />
                      {!available ? <span className="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-foreground/70" /> : null}
                    </button>
                  );
                }
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={pick}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-lg border transition-colors",
                      compact ? "min-w-8 px-2 py-0.5 text-[11px]" : "min-w-11 px-3.5 py-2 text-sm",
                      selected ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground",
                      !available && !selected && "text-muted-foreground line-through opacity-50",
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
