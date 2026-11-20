import { brand } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { productsQuery } from "@/lib/catalog";
import { primaryButton, useCommerce } from "@/lib/commerce";
import { useWishlist } from "@/lib/wishlist";
import { ProductGrid } from "@/components/site/ProductGrid";
import { StorePage } from "@/components/site/OrderBits";
import { LoadingRows } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: `Your wishlist — ${brand.name}` }, { name: "robots", content: "noindex, follow" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const { wishlist } = useCommerce();
  const list = useWishlist();
  const { data, isPending } = useQuery(productsQuery());

  if (!wishlist) {
    return (
      <StorePage title="Wishlist" narrow>
        <p className="text-muted-foreground">The wishlist isn't available right now.</p>
        <Link to="/shop" className={`${primaryButton} mt-6`}>Browse products</Link>
      </StorePage>
    );
  }

  const saved = (data ?? []).filter((p) => list.has(p.id));

  return (
    <StorePage title="Your wishlist">
      {isPending ? (
        <LoadingRows variant="store" />
      ) : saved.length === 0 ? (
        <div>
          <p className="text-muted-foreground">You haven't saved any pieces yet. Tap the heart on a piece you love.</p>
          <Link to="/shop" className={`${primaryButton} mt-6`}>Browse products</Link>
        </div>
      ) : (
        <ProductGrid products={saved} />
      )}
    </StorePage>
  );
}
