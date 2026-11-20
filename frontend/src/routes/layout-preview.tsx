import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import type { LayoutEdit } from "@/components/site/LayoutElements";
import type { FooterLayout, HeaderLayout, LayoutKind, Where } from "@/lib/layout";
import { PageLoading } from "@/components/ui/loading-rows";

/**
 * The canvas of the header & footer editor (Admin → Online store → Header & footer). The editor shows this page in an
 * <iframe> and sends the draft layout with postMessage; nothing is saved from here. Only the same origin is listened to.
 */
export const Route = createFileRoute("/layout-preview")({
  ssr: false,
  head: () => ({ meta: [{ title: `Header & footer canvas — ${brand.name}` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Canvas,
});

type Incoming = { type?: string; kind?: LayoutKind; layout?: HeaderLayout | FooterLayout; selectedId?: string | null };

const post = (message: Record<string, unknown>) => window.parent.postMessage(message, window.location.origin);

function Canvas() {
  const embedded = typeof window !== "undefined" && window.parent !== window;
  const [kind, setKind] = useState<LayoutKind>("header");
  const [layout, setLayout] = useState<HeaderLayout | FooterLayout | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!embedded) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const d = event.data as Incoming | null;
      if (d?.type !== "shop-layout-preview") return;
      if (d.kind) setKind(d.kind);
      if (d.layout) setLayout(d.layout);
      if (d.selectedId !== undefined) setSelectedId(d.selectedId);
    };
    window.addEventListener("message", onMessage);
    post({ type: "shop-layout-ready" });
    // Links, buttons and forms must not navigate or submit while editing.
    const stop = (e: Event) => {
      if ((e.target as Element | null)?.closest("a, form, button[type=submit]")) e.preventDefault();
    };
    document.addEventListener("click", stop, true);
    document.addEventListener("submit", stop, true);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", stop, true);
      document.removeEventListener("submit", stop, true);
    };
  }, [embedded]);

  if (!embedded) return <p className="p-10 text-center text-sm text-muted-foreground">This view is shown inside the header & footer editor.</p>;
  if (!layout) return <PageLoading />;

  const edit: LayoutEdit = {
    selectedId,
    onSelect: (id) => {
      setSelectedId(id);
      post({ type: "shop-layout-select", id });
    },
    onMove: (id: string, where: Where, index: number) => post({ type: "shop-layout-move", id, where, index }),
    onAdd: (where: Where) => post({ type: "shop-layout-add", where }),
  };

  return (
    <div className="flex min-h-screen flex-col" onClick={() => edit.onSelect(null)}>
      {kind === "header" ? <Header layout={layout as HeaderLayout} edit={edit} /> : null}
      <div className="flex-1 px-6 py-16 text-center text-sm text-muted-foreground">
        {kind === "header" ? "Your page content appears here, below the header." : "Your page content appears here, above the footer."}
      </div>
      {kind === "footer" ? <Footer layout={layout as FooterLayout} edit={edit} /> : null}
    </div>
  );
}
