import { useRef, useState } from "react";
import { Film, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { MAX_VIDEO_BYTES, uploadReelVideo } from "@/lib/reels";
import { cn } from "@/lib/utils";

/**
 * A product or variation video: upload one (MP4 or WebM), pick one from Media, or remove it. The preview is muted,
 * like the video on the website, which plays without sound.
 */
export function VideoPicker({ value, onChange, label, compact = false }: { value: string; onChange: (url: string) => void; label: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const busy = progress !== null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setProgress(0);
    try {
      onChange(await uploadReelVideo(file, setProgress, "products"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9c9] bg-white px-2.5 py-1 text-xs font-semibold text-[#303030] hover:bg-[#f7f7f7] disabled:opacity-50";

  return (
    <div className={cn("flex items-center gap-3", compact && "gap-2")}>
      {value ? (
        <video src={`${value}#t=0.1`} muted playsInline preload="metadata" aria-label={label} className={cn("shrink-0 rounded-lg border border-[#e3e3e3] bg-black object-cover", compact ? "h-12 w-9" : "h-20 w-14")} />
      ) : (
        <span className={cn("flex shrink-0 items-center justify-center rounded-lg border border-dashed border-[#c9c9c9] text-[#8a8a8a]", compact ? "h-12 w-9" : "h-20 w-14")}><Film className="size-4" /></span>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <input ref={input} type="file" accept="video/mp4,video/webm,.mp4,.webm" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
        <button type="button" disabled={busy} className={btn} onClick={() => input.current?.click()}><Upload className="size-3.5" /> {busy ? `${progress}%` : value ? "Replace" : "Upload"}</button>
        <button type="button" disabled={busy} className={btn} onClick={() => setChoosing(true)}>From Media</button>
        {value ? (
          <button type="button" disabled={busy} onClick={() => onChange("")} aria-label={`Remove ${label}`} title="Remove the video" className="inline-flex size-7 items-center justify-center rounded-md text-[#616161] hover:bg-[#fff4f4] hover:text-[#8e1f0b]"><Trash2 className="size-4" /></button>
        ) : null}
        {!compact ? <span className="basis-full text-xs text-[#616161]">MP4 or WebM, up to {Math.round(MAX_VIDEO_BYTES / 1048576)} MB. Plays on the product page without sound.</span> : null}
      </div>
      {choosing ? <MediaPicker kind="video" title="Choose a video" onClose={() => setChoosing(false)} onPick={(urls) => { setChoosing(false); if (urls[0]) onChange(urls[0]); }} /> : null}
    </div>
  );
}
