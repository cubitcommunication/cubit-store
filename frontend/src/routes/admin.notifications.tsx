import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Lock, Play, Upload } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Btn, Card, Field, adminInput } from "@/components/admin/ui";
import { Switch } from "@/components/ui/switch";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { api, ApiError } from "@/lib/api";
import { uploadToLibrary } from "@/lib/media-library";
import { TONES, previewTone } from "@/lib/notifications";
import { FormSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({ meta: [{ title: `Notifications — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: NotificationsGate,
});

type EventRow = { key: string; label: string; group: string; help: string; enabled: boolean };
type Settings = { events: EventRow[]; lowStockThreshold: number; devices: { email: string; devices: number }[]; sound: { tone: string; url: string } };

/** Which events alert the admins is the main administrator's choice. */
function NotificationsGate() {
  const { loading, isSuper } = useAdminAuth();
  if (loading) return <AdminShell title="Notifications"><FormSkeleton cards={2} fields={4} /></AdminShell>;
  if (!isSuper) {
    return (
      <AdminShell title="Notifications">
        <Card>
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-[#616161]" />
            <div>
              <p className="text-[13px] font-semibold">Only the main administrator can use this page</p>
              <p className="mt-1 text-xs text-[#616161]">The main administrator chooses which events send notifications. You can turn notifications on for your own phone or computer with the bell icon at the top of the admin.</p>
            </div>
          </div>
        </Card>
      </AdminShell>
    );
  }
  return <NotificationSettings />;
}

function NotificationSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "notification-settings"], queryFn: () => api<Settings>("/admin/notifications/settings"), staleTime: 0 });
  const [events, setEvents] = useState<Record<string, boolean>>({});
  const [threshold, setThreshold] = useState("3");
  const [tone, setTone] = useState("long");
  const [soundUrl, setSoundUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState<{ events: Record<string, boolean>; threshold: string; tone: string; soundUrl: string } | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const e = Object.fromEntries(q.data.events.map((r) => [r.key, r.enabled]));
    const t = String(q.data.lowStockThreshold);
    setEvents(e);
    setThreshold(t);
    setTone(q.data.sound.tone);
    setSoundUrl(q.data.sound.url);
    setSaved({ events: e, threshold: t, tone: q.data.sound.tone, soundUrl: q.data.sound.url });
  }, [q.data]);

  const dirty = saved !== null && (JSON.stringify(events) !== JSON.stringify(saved.events) || threshold !== saved.threshold || tone !== saved.tone || soundUrl !== saved.soundUrl);
  const bad = !(Number(threshold) >= 1 && Number(threshold) <= 1000) || (tone === "custom" && !soundUrl);

  const save = useMutation({
    mutationFn: () => api("/admin/notifications/settings", { method: "POST", body: { events, low_stock_threshold: Number(threshold), sound_tone: tone, sound_url: tone === "custom" ? soundUrl : "" } }),
    onSuccess: async () => { toast.success("Notification settings saved"); await qc.invalidateQueries({ queryKey: ["admin", "notification-settings"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save. Please try again."),
  });
  const test = useMutation({
    mutationFn: () => api("/admin/notifications/test", { method: "POST" }),
    onSuccess: () => toast.success("Test sent. It shows in the bell and on every device that has notifications turned on."),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send the test."),
  });

  const groups = [...new Set((q.data?.events ?? []).map((r) => r.group))];
  const total = (q.data?.devices ?? []).reduce((n, d) => n + d.devices, 0);

  return (
    <AdminShell
      title="Notifications"
      actions={
        <>
          <Btn disabled={!dirty || save.isPending} onClick={() => saved && (setEvents(saved.events), setThreshold(saved.threshold), setTone(saved.tone), setSoundUrl(saved.soundUrl))}>Discard</Btn>
          <Btn variant="primary" disabled={!dirty || bad || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Btn>
        </>
      }
    >
      <p className="-mt-2 mb-4 max-w-3xl text-[13px] text-[#616161]">
        Choose which events alert your team. Every admin sees them in the bell at the top of the admin, with a pop-up and a sound while the admin is open. Anyone can also turn on system notifications for their own phone or computer from the bell, to be alerted even when the admin is closed.
      </p>

      {q.isPending ? (
        <FormSkeleton cards={2} fields={4} />
      ) : q.isError ? (
        <Card><p className="text-[13px]">Could not load. <Btn onClick={() => void q.refetch()}>Try again</Btn></p></Card>
      ) : (
        <div className="grid max-w-3xl gap-4">
          {groups.map((group) => (
            <Card key={group} title={group} flush>
              <ul className="divide-y divide-[#ebebeb] border-t border-[#ebebeb]">
                {q.data!.events.filter((r) => r.group === group).map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">{r.label}</p>
                      <p className="text-xs text-[#616161]">{r.help}</p>
                      {r.key === "low_stock" ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-[#616161]">
                          Warn when only
                          <input inputMode="numeric" aria-label="Low stock level" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} className={`${adminInput} !w-16 text-center ${bad ? "!border-[#c70a24]" : ""}`} />
                          or fewer are left
                        </div>
                      ) : null}
                    </div>
                    <Switch checked={Boolean(events[r.key])} onCheckedChange={(on) => setEvents((e) => ({ ...e, [r.key]: on }))} aria-label={r.label} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          <Card title="Notification sound">
            <p className="text-[13px] text-[#616161]">The sound every admin hears when a new notification arrives while the admin is open. Each person can still switch their own sound off with the speaker icon in the bell.</p>
            <ul className="mt-3 space-y-2">
              {TONES.map((t) => (
                <li key={t.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${tone === t.id ? "border-[#303030] bg-[#f7f7f7]" : "border-[#e3e3e3]"}`}>
                  <input type="radio" name="tone" id={`tone-${t.id}`} checked={tone === t.id} onChange={() => setTone(t.id)} className="size-4" />
                  <label htmlFor={`tone-${t.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-[13px] font-semibold">{t.label}</span>
                    <span className="block text-xs text-[#616161]">{t.id === "custom" && soundUrl ? `Your file: ${decodeURIComponent(soundUrl.split("/").pop() ?? "")}` : t.help}</span>
                  </label>
                  {t.id === "custom" ? (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#c9c9c9] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-[#f7f7f7]">
                      <Upload className="size-3.5" /> {uploading ? "Uploading…" : soundUrl ? "Replace" : "Upload MP3"}
                      <input
                        type="file"
                        accept="audio/mpeg,.mp3"
                        className="sr-only"
                        disabled={uploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          if (!/\.mp3$/i.test(file.name)) return void toast.error("Please choose an MP3 file.");
                          setUploading(true);
                          try {
                            const url = await uploadToLibrary(file);
                            setSoundUrl(url);
                            setTone("custom");
                            previewTone("custom", url);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Could not upload the file.");
                          } finally {
                            setUploading(false);
                          }
                        }}
                      />
                    </label>
                  ) : null}
                  <Btn disabled={t.id === "custom" && !soundUrl} onClick={() => previewTone(t.id, soundUrl)}><Play className="size-3.5" /> Play</Btn>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[#616161]">
              Pick a tone, press Play to hear it, then Save. The uploaded file is kept in Media. On phones and computers where system notifications are turned on and the admin is closed, the device plays its own notification sound, which the website cannot change: set it in the phone's or browser's notification settings.
            </p>
          </Card>

          <Card title="Devices and a test">
            <p className="text-[13px]">
              <Bell className="mr-1.5 inline size-4 text-[#616161]" />
              {total ? <><b>{total}</b> {total === 1 ? "device has" : "devices have"} system notifications turned on.</> : "No device has system notifications turned on yet."}
            </p>
            {q.data!.devices.length ? (
              <ul className="mt-2 space-y-1 text-xs text-[#616161]">
                {q.data!.devices.map((d) => <li key={d.email} className="flex items-center gap-2"><span>{d.email}</span><Badge>{d.devices} {d.devices === 1 ? "device" : "devices"}</Badge></li>)}
              </ul>
            ) : null}
            <p className="mt-3 text-xs text-[#616161]">
              Each person turns notifications on for their own device with the bell icon at the top of the admin. On an iPhone or iPad, open the admin in Safari, tap Share → Add to Home Screen, then open it from that icon and turn notifications on there.
            </p>
            <div className="mt-3">
              <Field label="Send a test notification" help="Goes to the bell and to every device that has notifications on, whatever the switches above say.">
                <Btn disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? "Sending…" : "Send a test"}</Btn>
              </Field>
            </div>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
