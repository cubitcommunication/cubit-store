import { LOCALE, TIMEZONE } from "@/config/brand";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Pencil, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { Badge, Btn, Card, IconBtn, adminInput } from "@/components/admin/ui";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LoadingRows } from "@/components/ui/loading-rows";

export type TeamUser = {
  id: string;
  email: string;
  name: string | null;
  role: "super" | "admin";
  active: boolean;
  last_login_at: string | null;
  last_activity_at: string | null;
  created_at: string | null;
  created_by: string | null;
};

const usersQuery = () => ({ queryKey: ["admin", "users"] as const, queryFn: () => api<{ users: TeamUser[] }>("/admin/users"), staleTime: 0 });

export const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(LOCALE, { timeZone: TIMEZONE, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never";

function Avatar({ user }: { user: TeamUser }) {
  const letter = (user.name || user.email).slice(0, 1).toUpperCase();
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", user.role === "super" ? "bg-[#303030] text-white" : "bg-[#e3e3e3] text-[#303030]", !user.active && "opacity-50")}>
      {letter}
    </span>
  );
}

/** The team: everyone who can sign in to this admin panel. Add, edit and delete are icon buttons. */
export function TeamPanel({ meEmail }: { meEmail?: string | null | undefined }) {
  const qc = useQueryClient();
  const users = useQuery(usersQuery());
  // `null` = closed, "new" = adding, otherwise the user being edited.
  const [editing, setEditing] = useState<TeamUser | "new" | null>(null);
  const [deleting, setDeleting] = useState<TeamUser | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "users"] });
  const remove = useMutation({
    mutationFn: (u: TeamUser) => api<{ ok: true }>(`/admin/users/${u.id}/delete`, { method: "POST" }),
    onSuccess: async () => {
      toast.success("User deleted");
      setDeleting(null);
      await refresh();
      void qc.invalidateQueries({ queryKey: ["admin", "activity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = users.data?.users ?? [];

  return (
    <>
      <Card
        title={`Team${list.length ? ` (${list.length})` : ""}`}
        flush
        actions={<IconBtn icon={UserPlus} label="Add user" onClick={() => setEditing("new")} className="size-8 border-[#c9c9c9] bg-white" />}
      >
        <p className="px-4 pb-3 text-xs text-[#616161]">
          Everyone here can sign in to this admin panel. Everything they do is recorded in the Activity log. Only the main administrator can add, edit or remove users.
        </p>
        {users.isPending ? (
          <LoadingRows />
        ) : users.isError ? (
          <p className="px-4 pb-4 text-[13px] text-[#616161]">Could not load the team. <button type="button" className="text-[#005bd3] underline" onClick={() => void users.refetch()}>Try again</button></p>
        ) : (
          <ul className="divide-y divide-[#ebebeb] border-t border-[#ebebeb]">
            {list.map((u) => {
              const isSuper = u.role === "super";
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar user={u} />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#303030]">
                      <span className="truncate">{u.name || u.email}</span>
                      {isSuper ? <Badge tone="info"><ShieldCheck className="mr-1 size-3" />Super admin</Badge> : <Badge>Admin</Badge>}
                      {!u.active ? <Badge tone="critical">Switched off</Badge> : null}
                      {u.email === meEmail ? <span className="text-xs font-normal text-[#616161]">(you)</span> : null}
                    </p>
                    <p className="truncate text-xs text-[#616161]">{u.email}</p>
                  </div>
                  <dl className="hidden min-w-[9rem] text-xs text-[#616161] md:block">
                    <div className="flex gap-1"><dt>Last sign-in:</dt><dd className="text-[#303030]">{when(u.last_login_at)}</dd></div>
                    <div className="flex gap-1"><dt>Last activity:</dt><dd className="text-[#303030]">{when(u.last_activity_at)}</dd></div>
                  </dl>
                  <div className="ml-auto flex items-center gap-0.5">
                    <IconBtn icon={Pencil} label={`Edit ${u.name || u.email}`} onClick={() => setEditing(u)} />
                    {isSuper ? (
                      <span title="The main administrator cannot be deleted" className="inline-flex size-7 items-center justify-center text-[#8a8a8a]"><Lock className="size-4" aria-label="The main administrator cannot be deleted" /></span>
                    ) : (
                      <IconBtn icon={Trash2} tone="danger" label={`Delete ${u.name || u.email}`} onClick={() => setDeleting(u)} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing ? <UserDialog user={editing === "new" ? null : editing} isSelf={editing !== "new" && editing.email === meEmail} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); void qc.invalidateQueries({ queryKey: ["admin", "activity"] }); }} /> : null}

      {deleting ? (
        <Modal title="Delete this user?" onClose={() => setDeleting(null)}>
          <p className="text-[13px] text-[#303030]">
            <strong>{deleting.name || deleting.email}</strong> ({deleting.email}) will be signed out and can no longer use the admin panel. Their past activity stays in the Activity log.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Btn onClick={() => setDeleting(null)}>Cancel</Btn>
            <Btn variant="primary" className="!bg-[#8e1f0b] hover:!bg-[#6f1809]" disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>{remove.isPending ? "Deleting…" : "Delete user"}</Btn>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md rounded-[14px] bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[#303030]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-[#f1f1f1]"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function UserDialog({ user, isSelf, onClose, onSaved }: { user: TeamUser | null; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const isNew = user === null;
  const isSuper = user?.role === "super";
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(user?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Please enter a name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Please enter a valid e-mail address.");
      if ((isNew || password) && password.length < 10) throw new Error("The password needs at least 10 characters.");
      if (isNew) return api("/admin/users", { method: "POST", body: { name: name.trim(), email: email.trim(), password } });
      return api(`/admin/users/${user.id}`, { method: "POST", body: { name: name.trim(), ...(isSuper ? {} : { email: email.trim(), active }), ...(password ? { password } : {}) } });
    },
    onSuccess: () => { toast.success(isNew ? "User added" : "User saved"); onSaved(); },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(null); save.mutate(); };
  const canSetPassword = isNew || !isSuper || isSelf;

  return (
    <Modal title={isNew ? "Add user" : `Edit ${user.name || user.email}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <label className="block text-[13px]"><span className="font-medium">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={cn(adminInput, "mt-1")} autoComplete="off" />
        </label>
        <label className="block text-[13px]"><span className="font-medium">E-mail (their sign-in)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSuper} maxLength={160} className={cn(adminInput, "mt-1 disabled:bg-[#f1f1f1] disabled:text-[#8a8a8a]")} autoComplete="off" />
          {isSuper ? <span className="mt-1 block text-xs text-[#616161]">The main administrator’s e-mail cannot be changed.</span> : null}
        </label>
        {canSetPassword ? (
          <label className="block text-[13px]"><span className="font-medium">{isNew ? "Password" : "New password"}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={cn(adminInput, "mt-1")} autoComplete="new-password" />
            <span className="mt-1 block text-xs text-[#616161]">{isNew ? "At least 10 characters. Share it with them privately." : "Leave empty to keep the current password. Setting one signs that user out everywhere."}</span>
          </label>
        ) : null}
        {!isNew && !isSuper ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e3e3e3] px-3 py-2.5">
            <div><p className="text-[13px] font-medium">Can sign in</p><p className="text-xs text-[#616161]">Switch off to stop this user signing in without deleting them.</p></div>
            <Switch checked={active} onCheckedChange={setActive} aria-label="Can sign in" />
          </div>
        ) : null}
        {error ? <p role="alert" className="text-[13px] text-[#8e1f0b]">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : isNew ? "Add user" : "Save"}</Btn>
        </div>
      </form>
    </Modal>
  );
}
