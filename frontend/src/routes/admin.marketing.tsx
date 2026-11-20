import { brand } from "@/config/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Btn, Card } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/marketing")({
  head: () => ({ meta: [{ title: `Marketing — ${brand.name} Admin` }] }),
  component: MarketingPage,
});

function MarketingPage() {
  const feed = `${typeof window === "undefined" ? "" : window.location.origin}/api/feeds/products.xml`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(feed);
      toast.success("Feed address copied");
    } catch {
      toast.error("Could not copy. Select the address and copy it yourself.");
    }
  }
  return (
    <AdminShell title="Marketing">
      <div className="space-y-4">
        <Card title="Product feed for Google and Meta">
          <p className="text-[13px] text-[#616161]">
            One live file that lists every published piece (and each variation) with its picture, price and stock. Google Merchant Center (free listings and Shopping ads) and Meta Commerce Manager (Facebook and Instagram shops) read it on a schedule, so prices and stock stay up to date by themselves.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input readOnly value={feed} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-[#c9c9c9] bg-[#fafafa] px-3 py-2 text-[13px]" aria-label="Product feed address" />
            <Btn onClick={() => void copy()}><Copy className="size-3.5" /> Copy</Btn>
            <a href={feed} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9c9] bg-white px-3 py-2 text-[13px] font-medium hover:bg-[#f7f7f7]"><ExternalLink className="size-3.5" /> Open</a>
          </div>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[13px]">
            <li><strong>Google:</strong> Merchant Center → Products → Feeds → add a feed → "Scheduled fetch" and paste the address.</li>
            <li><strong>Meta:</strong> Commerce Manager → Catalog → Data sources → "Data feed" → "Scheduled feed" and paste the address.</li>
            <li>Pieces without a picture, with no price, hidden or archived are left out automatically.</li>
          </ol>
          <p className="mt-3 text-xs text-[#616161]">The feed needs your site to be public on the internet; it will not work from a local test copy.</p>
        </Card>

        <Card title="Other marketing tools">
          <ul className="divide-y divide-[#ebebeb] text-[13px]">
            <li className="flex items-center justify-between gap-3 py-2.5"><span><strong>Discount codes</strong> — offers, free shipping and promoted codes</span><Link to="/admin/coupons" className="text-[#005bd3] hover:underline">Open</Link></li>
            <li className="flex items-center justify-between gap-3 py-2.5"><span><strong>Newsletter subscribers</strong> — export the list for your e-mail tool</span><Link to="/admin/subscribers" className="text-[#005bd3] hover:underline">Open</Link></li>
            <li className="flex items-center justify-between gap-3 py-2.5"><span><strong>Abandoned carts</strong> — reminder e-mails for unfinished orders</span><Link to="/admin/abandoned" className="text-[#005bd3] hover:underline">Open</Link></li>
            <li className="flex items-center justify-between gap-3 py-2.5"><span><strong>Free gifts and free shipping</strong> — the cart meter</span><Link to="/admin/commerce" className="text-[#005bd3] hover:underline">Open</Link></li>
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
