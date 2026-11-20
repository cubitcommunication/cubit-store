import { LOCALE } from "@/config/brand";
import { api } from "@/lib/api";

/** One line in the bell: something that happened (a new order, low stock...). */
export type AdminNotification = {
  id: string;
  event: string;
  title: string;
  body: string;
  url: string | null;
  at: string;
  unread: boolean;
};
export type Feed = { items: AdminNotification[]; unread: number; devices: number; sound?: { tone: string; url: string } };

/** The feed is checked every half minute while the admin is open (the hosting cannot keep a live connection). */
export const feedQuery = () => ({
  queryKey: ["admin", "notifications"] as const,
  queryFn: () => api<Feed>("/admin/notifications"),
  refetchInterval: 25_000,
  refetchIntervalInBackground: true,
  staleTime: 0,
  retry: false,
});

/* ------------------------------------------------------------------ system notifications (web push) */

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** What this device can do right now. iPhones only allow notifications for a site added to the Home Screen. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/admin/");
    return (await reg?.pushManager.getSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

function keyBytes(base64Url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration("/admin/")) ?? (await navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin/" }));
  await navigator.serviceWorker.ready;
  return reg;
}

/** Sends this device's subscription to the server (used when turning on, and to keep it in step afterwards). */
async function sync(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await api("/admin/notifications/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys } });
}

/** Asks permission, subscribes this device and tells the server. Must be called from a click. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  const { publicKey } = await api<{ publicKey: string }>("/admin/notifications/push-key");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
  await sync(sub);
  return "on";
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/admin/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api("/admin/notifications/unsubscribe", { method: "POST", body: { endpoint } }).catch(() => undefined);
}

/** If this device is already subscribed, quietly tell the server again (it may have been signed in as someone else). */
export async function refreshSubscription(): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration("/admin/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sync(sub);
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------------ the chime */

const SOUND_KEY = "shop-admin-sound";
export const soundOn = (): boolean => {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
};
export const setSound = (on: boolean) => {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
};

let audio: AudioContext | null = null;

/** Browsers only allow sound after the person has clicked or pressed a key once; this unlocks it on the first one. */
export function primeSound() {
  const unlock = () => {
    try {
      audio ??= new AudioContext();
      void audio.resume();
    } catch {
      /* no audio support */
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

/** The sound for a new notification: one of the built-in tones, or an uploaded audio file ("custom"). */
export type NotificationSound = { tone: string; url: string };
export const DEFAULT_SOUND: NotificationSound = { tone: "long", url: "" };

export const TONES: { id: string; label: string; help: string }[] = [
  { id: "long", label: "Long chime", help: "A rising four-note chime, about 3 seconds. Easy to hear across a room." },
  { id: "bell", label: "Bell", help: "Two soft bell strikes that ring out, about 4 seconds." },
  { id: "classic", label: "Short ding", help: "The original two-note ding, under a second." },
  { id: "custom", label: "My own sound", help: "Upload an MP3 (a few seconds long works best)." },
];

/** One soft note: a sine with a little overtone, a quick attack and a long fade. */
function note(ctx: AudioContext, freq: number, at: number, length: number, peak = 0.22) {
  for (const [mult, level] of [[1, 1], [2, 0.18]] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak * level, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

let custom: HTMLAudioElement | null = null;
let customTimer: number | undefined;

/** Plays a tone now (the "sound on" switch is not checked, so the settings page can preview it). */
export function previewTone(tone: string, url = "") {
  try {
    if (custom) {
      custom.pause();
      custom = null;
      window.clearTimeout(customTimer);
    }
    if (tone === "custom" && url) {
      custom = new Audio(url);
      void custom.play().catch(() => undefined);
      // A long file never rings for more than 15 seconds.
      customTimer = window.setTimeout(() => custom?.pause(), 15_000);
      return;
    }
    audio ??= new AudioContext();
    const ctx = audio;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime + 0.02;
    if (tone === "classic") {
      note(ctx, 880, t, 0.5, 0.25);
      note(ctx, 1318.5, t + 0.16, 0.5, 0.25);
    } else if (tone === "bell") {
      // A bell is a note with inharmonic overtones that all fade slowly; strike it twice.
      for (const at of [0, 1.5]) {
        for (const [ratio, level, fade] of [[1, 1, 2.6], [2.76, 0.5, 1.8], [5.4, 0.25, 1.1], [8.93, 0.12, 0.7]] as const) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = 660 * ratio;
          gain.gain.setValueAtTime(0.0001, t + at);
          gain.gain.exponentialRampToValueAtTime(0.3 * level, t + at + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + at + fade);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t + at);
          osc.stop(t + at + fade + 0.05);
        }
      }
    } else {
      // "long": C-E-G-C arpeggio, then the whole chord rings out.
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(ctx, f, t + i * 0.24, 1.6));
      [523.25, 659.25, 783.99].forEach((f) => note(ctx, f, t + 1.05, 1.9, 0.12));
    }
  } catch {
    /* no audio support */
  }
}

/** The chime for a new notification, in the tone the main administrator chose (unless this browser has the sound off). */
export function playChime(sound: NotificationSound = DEFAULT_SOUND) {
  if (!soundOn()) return;
  previewTone(sound.tone, sound.url);
}

/** "2 min ago", "Yesterday"... in plain words. */
export function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "Yesterday";
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}
