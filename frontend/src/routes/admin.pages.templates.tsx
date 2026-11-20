import { brand } from "@/config/brand";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Btn } from "@/components/admin/ui";
import { db } from "@/lib/data";
import { HOME_TEMPLATES, type HomeTemplate } from "@/lib/home-templates";
import { SYSTEM_PAGES, newId, systemSlug } from "@/lib/pages";

export const Route = createFileRoute("/admin/pages/templates")({
  head: () => ({ meta: [{ title: `Page templates — ${brand.name} Admin` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Templates,
});

const TONE: Record<HomeTemplate["outline"][number]["tone"], string> = {
  dark: "bg-[#222] text-white",
  light: "border border-[#e3e3e3] bg-white text-[#303030]",
  accent: "bg-[#b3261e] text-white",
  soft: "bg-[#f1f1f1] text-[#303030]",
};

function Templates() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const home = useQuery({
    queryKey: ["admin", "home-page-row"],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select("id,published").eq("slug", systemSlug("home")).eq("kind", "home").maybeSingle();
      if (error) throw new Error("PAGES_UNAVAILABLE");
      return (data ?? null) as { id: string; published: boolean } | null;
    },
  });

  const apply = useMutation({
    mutationFn: async (t: HomeTemplate) => {
      const blocks = t.build();
      const row = home.data;
      if (row) {
        const { error } = await db.from("pages").update({ blocks }).eq("id", row.id);
        if (error) throw error;
        return row.id;
      }
      const id = newId();
      const meta = SYSTEM_PAGES.find((p) => p.kind === "home")!;
      const { error } = await db.from("pages").insert({ id, title: meta.title, slug: systemSlug("home"), kind: "home", published: false, blocks });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["page"] });
      toast.success("Template added to your Home page editor.");
      void navigate({ to: "/admin/pages/$id/edit", params: { id } });
    },
    onError: () => toast.error("Could not apply the template. Please try again."),
  });

  function choose(t: HomeTemplate) {
    const live = home.data?.published;
    const message = live
      ? `Use “${t.name}”? Your Home page is published, so visitors will see this design straight away and your current Home page design is replaced. (Pictures and text are yours to edit afterwards.)`
      : home.data
        ? `Use “${t.name}”? It replaces the design in your Home page editor. Nothing goes live until you press Publish.`
        : `Use “${t.name}” as the start of your Home page? Nothing goes live until you press Publish.`;
    if (window.confirm(message)) apply.mutate(t);
  }

  return (
    <AdminShell title="Page templates" back={{ to: "/admin/pages", label: "Pages" }}>
      <p className="mb-5 max-w-3xl text-[13px] text-[#616161]">
        Pick a ready-made Home page and make it yours. Each template is a set of sections you can reorder, edit or delete in the page builder, with your own text and pictures.
        {home.data?.published ? " Your Home page is published: applying a template changes the live site immediately." : " Nothing changes on the live site until you press Publish."}
      </p>
      <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {HOME_TEMPLATES.map((t) => (
          <li key={t.id} className="flex flex-col overflow-hidden rounded-xl border border-[#e3e3e3] bg-white shadow-sm">
            <div className="flex flex-col gap-1.5 bg-[#f6f6f6] p-4" aria-hidden="true">
              {t.outline.map((o) => (
                <div key={o.label} className={`rounded-md px-3 py-2 text-[11px] font-medium ${TONE[o.tone]}`}>{o.label}</div>
              ))}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold"><LayoutTemplate className="size-4 text-[#616161]" />{t.name}</h3>
              <p className="mt-0.5 text-[12px] font-medium text-[#616161]">{t.tagline}</p>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[#303030]">{t.description}</p>
              <div className="mt-4"><Btn variant="primary" disabled={apply.isPending || home.isPending} onClick={() => choose(t)}>Use this template</Btn></div>
            </div>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
