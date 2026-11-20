import { brand } from "@/config/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageBlocks, type EditApi } from "@/components/site/PageBlocks";
import { CollectionProvider, ProductProvider } from "@/components/site/TemplateBlocks";
import { primaryImage, productsQuery } from "@/lib/catalog";
import type { Block, PageKind } from "@/lib/pages";

/**
 * The canvas of the page builder. The editor (Admin → Pages) shows this page inside an <iframe> at the
 * chosen device width and sends the draft blocks with postMessage; nothing is saved or readable from here.
 * Only the same origin is listened to, and opened on its own the page shows nothing.
 */
export const Route = createFileRoute("/page-preview")({
  ssr: false,
  head: () => ({ meta: [{ title: `Page builder canvas — ${brand.name}` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Canvas,
});

type Incoming = { type?: string; kind?: PageKind; blocks?: Block[]; selectedId?: string | null; focusId?: string | null };

function post(message: Record<string, unknown>) {
  window.parent.postMessage(message, window.location.origin);
}

function Canvas() {
  const embedded = typeof window !== "undefined" && window.parent !== window;
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [kind, setKind] = useState<PageKind>("page");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const blocksRef = useRef<Block[]>([]);
  blocksRef.current = blocks;

  useEffect(() => {
    if (!embedded) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as Incoming | null;
      if (data?.type !== "shop-page-preview") return;
      if (data.kind) setKind(data.kind);
      if (Array.isArray(data.blocks)) setBlocks(data.blocks);
      if (data.selectedId !== undefined) setSelectedId(data.selectedId);
      if (data.focusId) {
        // A block chosen in the Layers panel: bring it into view.
        requestAnimationFrame(() => document.querySelector(`[data-block-id="${CSS.escape(data.focusId!)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
      }
    };
    window.addEventListener("message", onMessage);
    post({ type: "shop-page-ready" });

    // Links, buttons and forms must not navigate while editing.
    const stop = (e: Event) => {
      if ((e.target as Element | null)?.closest("a, form")) e.preventDefault();
    };
    document.addEventListener("click", stop, true);
    document.addEventListener("submit", stop, true);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", stop, true);
      document.removeEventListener("submit", stop, true);
    };
  }, [embedded]);

  // Tell the editor where each top-level block sits, so a block dragged from the library can be dropped between them.
  useEffect(() => {
    if (!embedded) return;
    let timer = 0;
    const report = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const items = blocksRef.current
          .map((b) => {
            const el = document.querySelector(`[data-block-id="${CSS.escape(b.id)}"]`);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { id: b.id, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
          })
          .filter(Boolean);
        post({ type: "shop-page-layout", blocks: items, scrollY: window.scrollY });
      }, 60);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(document.body);
    window.addEventListener("scroll", report, { passive: true });
    window.addEventListener("resize", report);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("scroll", report);
      window.removeEventListener("resize", report);
    };
  }, [embedded, blocks]);

  if (!embedded) return <p className="p-10 text-center text-sm text-muted-foreground">This view is shown inside the page builder.</p>;

  const edit: EditApi = {
    selectedId,
    onSelect: (id) => {
      setSelectedId(id);
      post({ type: "shop-page-select", id });
    },
    onAddAt: (index) => post({ type: "shop-page-add", index }),
    onAddInColumn: (parentId, col) => post({ type: "shop-page-add-col", parentId, col }),
  };

  return (
    <div className="pb-24" onClick={() => { setSelectedId(null); post({ type: "shop-page-select", id: null }); }}>
      <TemplateDemo kind={kind}>
        <PageBlocks blocks={blocks} edit={edit} />
      </TemplateDemo>
    </div>
  );
}

/** Product and collection templates are edited against a sample product / collection from the shop. */
function TemplateDemo({ kind, children }: { kind: PageKind; children: React.ReactNode }) {
  const { data } = useQuery({ ...productsQuery(), enabled: kind === "product" || kind === "collection" });
  const first = data?.[0];
  if (kind === "product") {
    if (!first) return <p className="p-10 text-center text-sm text-muted-foreground">Add a product to preview the product template.</p>;
    return <ProductProvider product={first}>{children}</ProductProvider>;
  }
  if (kind === "collection") {
    const products = (data ?? []).slice(0, 8);
    return (
      <CollectionProvider
        value={{
          name: "Sample collection",
          description: "A short description of the collection appears here.",
          image: first ? (primaryImage(first)?.image_url ?? null) : null,
          products,
          isLoading: !data,
          isError: false,
          onRetry: () => undefined,
          parent: { label: "Collections", to: "/collections" },
          heightClass: "h-[46vh] min-h-[300px]",
        }}
      >
        {children}
      </CollectionProvider>
    );
  }
  return <>{children}</>;
}
