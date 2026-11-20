import { brand } from "@/config/brand";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { accountApi, useCustomer } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { inputClass, labelClass, primaryButton } from "@/lib/commerce";

export const Route = createFileRoute("/account/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { customer } = useCustomer();
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", emailPassword: "", phone: "", marketing: false, dob: "", giftNote: "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (customer) setForm({ name: customer.name, email: customer.email, emailPassword: "", phone: customer.phone ?? "", marketing: customer.acceptsMarketing, dob: customer.dateOfBirth ?? "", giftNote: customer.giftNote ?? "" });
  }, [customer]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const emailChanged = form.email.trim().toLowerCase() !== (customer?.email ?? "").toLowerCase();
      await accountApi.profile({ name: form.name, ...(emailChanged ? { email: form.email.trim(), currentPassword: form.emailPassword } : {}), phone: form.phone, acceptsMarketing: form.marketing, dateOfBirth: form.dob || null, giftNote: form.giftNote });
      await qc.invalidateQueries({ queryKey: ["customer"] });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (pw.next.length < 8) {
      toast.error("Please choose a new password of at least 8 characters.");
      return;
    }
    try {
      const result = await accountApi.changePassword({ currentPassword: pw.current, newPassword: pw.next });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Password changed. Please sign in again.");
      await qc.invalidateQueries({ queryKey: ["customer"] });
      router.history.push("/login");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not change your password.");
    }
  }

  return (
    <div className="max-w-xl space-y-12">
      <form onSubmit={saveProfile} className="space-y-5">
        <h2 className="font-display text-2xl">Profile</h2>
        <div><label className={labelClass} htmlFor="p-name">Full name</label><input id="p-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={`${inputClass} mt-2`} /></div>
        <div><label className={labelClass} htmlFor="p-email">E-mail</label><input id="p-email" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={`${inputClass} mt-2`} /></div>
        {form.email.trim().toLowerCase() !== (customer?.email ?? "").toLowerCase() ? (
          <div><label className={labelClass} htmlFor="p-email-pw">Current password (needed to change your e-mail)</label><input id="p-email-pw" type="password" autoComplete="current-password" required value={form.emailPassword} onChange={(e) => setForm((f) => ({ ...f, emailPassword: e.target.value }))} className={`${inputClass} mt-2`} /></div>
        ) : null}
        <div><label className={labelClass} htmlFor="p-phone">Phone</label><input id="p-phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={`${inputClass} mt-2`} /></div>
        <div className="rounded-[12px] border border-border bg-surface p-4">
          <p className="font-display text-lg">🎂 Birthday surprise</p>
          <p className="mt-1 text-sm text-muted-foreground">Tell us when your birthday is and we may send you a little something from {brand.name}.</p>
          <div className="mt-4"><label className={labelClass} htmlFor="p-dob">Date of birth</label><input id="p-dob" type="date" max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} className={`${inputClass} mt-2`} /></div>
          <div className="mt-4"><label className={labelClass} htmlFor="p-gift">Tell us what you love (optional)</label><textarea id="p-gift" rows={3} maxLength={500} value={form.giftNote} onChange={(e) => setForm((f) => ({ ...f, giftNote: e.target.value }))} className={`${inputClass} mt-2`} placeholder="For example: your favourite colours or sizes" /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.marketing} onChange={(e) => setForm((f) => ({ ...f, marketing: e.target.checked }))} className="accent-[var(--brand-red)]" /> Send me news about new collections</label>
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Save profile"}</button>
      </form>

      <form onSubmit={changePassword} className="space-y-5 border-t border-border pt-10">
        <h2 className="font-display text-2xl">Change password</h2>
        <div><label className={labelClass} htmlFor="pw-cur">Current password</label><input id="pw-cur" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} className={`${inputClass} mt-2`} /></div>
        <div><label className={labelClass} htmlFor="pw-new">New password (min. 8 characters)</label><input id="pw-new" type="password" autoComplete="new-password" required minLength={8} value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} className={`${inputClass} mt-2`} /></div>
        <button type="submit" className={primaryButton}>Change password</button>
      </form>
    </div>
  );
}
