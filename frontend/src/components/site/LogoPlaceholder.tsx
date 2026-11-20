import { brand as store } from "@/config/brand";
import { useBrandLogos } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Shown wherever a picture is missing (a product without a photo, a collection or blog post without a cover):
 * the store logo, softly, on the same grey as the picture area. Uses the logo set in Admin when there is one.
 */
export function LogoPlaceholder({ className }: { className?: string }) {
  const brand = useBrandLogos();
  return (
    <div className={cn("flex items-center justify-center bg-muted", className)} role="img" aria-label={store.name}>
      {brand.logo ? <img src={brand.logo} alt="" draggable={false} className="max-h-[30%] w-[46%] max-w-[10rem] object-contain opacity-25" /> : <span className="eyebrow px-3 text-center text-muted-foreground/50">{store.name}</span>}
    </div>
  );
}
