import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { OrderAddress, OrderView, ReturnsInfo } from "@/lib/commerce";

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  acceptsMarketing: boolean;
  dateOfBirth: string | null;
  giftNote: string | null;
};

export type SavedAddress = OrderAddress & { id: string; isDefault: boolean };

type Outcome = { ok: true } | { ok: false; message: string };

export const accountApi = {
  session: () => api<{ customer: Customer | null }>("/account/session"),
  signIn: (data: { email: string; password: string }) => api<Outcome>("/account/sign-in", { method: "POST", body: data, recaptcha: "login" }),
  register: (data: { name: string; email: string; phone?: string; password: string; dateOfBirth?: string }) =>
    api<Outcome>("/account/register", { method: "POST", body: data, recaptcha: "register" }),
  signOut: () => api<{ ok: true }>("/account/sign-out", { method: "POST" }),
  forgot: (email: string) => api<{ ok: true }>("/account/forgot-password", { method: "POST", body: { email }, recaptcha: "forgot_password" }),
  reset: (data: { email: string; token: string; password: string }) =>
    api<Outcome>("/account/reset-password", { method: "POST", body: data }),
  profile: (data: { name: string; email?: string; currentPassword?: string; phone: string; acceptsMarketing: boolean; dateOfBirth: string | null; giftNote: string }) =>
    api<{ ok: true }>("/account/profile", { method: "POST", body: data }),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api<Outcome>("/account/change-password", { method: "POST", body: data }),
  addresses: () => api<{ addresses: SavedAddress[] }>("/account/addresses"),
  saveAddress: (data: Partial<SavedAddress>) =>
    api<{ addresses: SavedAddress[] }>("/account/addresses", { method: "POST", body: data }),
  deleteAddress: (id: string) =>
    api<{ addresses: SavedAddress[] }>("/account/addresses/delete", { method: "POST", body: { id } }),
  orders: () => api<{ orders: OrderView[] }>("/account/orders"),
  order: (number: number | string) => api<OrderView>(`/account/orders/${number}`),
  requestReturn: (number: number | string, data: { items: { id: string; qty: number }[]; reason: string; details?: string | undefined }) =>
    api<{ returns: ReturnsInfo }>(`/account/orders/${number}/return`, { method: "POST", body: data }),
};

/** The signed-in shopper, or null. Always null while customer accounts are switched off. */
export function useCustomer() {
  const query = useQuery({
    queryKey: ["customer"],
    queryFn: async () => (await accountApi.session()).customer,
    staleTime: 60_000,
    retry: false,
  });
  return { customer: query.data ?? null, loading: query.isPending, refetch: query.refetch };
}
