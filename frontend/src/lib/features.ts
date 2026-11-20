import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Features = { offline_shop: boolean };

/**
 * Paid add-ons switched on by the vendor in the server's .env (never from this panel). While one is off, the server refuses
 * its endpoints and the panel hides its screens. Treated as off until the answer arrives.
 */
export function useFeatures(): { offlineShop: boolean } {
  const q = useQuery({
    queryKey: ["admin", "features"],
    queryFn: async () => (await api<{ features: Features }>("/admin/features")).features,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return { offlineShop: q.data?.offline_shop === true };
}
