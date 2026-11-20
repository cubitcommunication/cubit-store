/** Menu text with its optional small tag (NEW, ARCHIVE...). */
export function NavLabel({ label, badge }: { label: string; badge?: string | null | undefined }) {
  const tag = (badge ?? "").trim();
  const quiet = /^(archive|ended|past|closed)$/i.test(tag);
  return (
    <span className="inline-flex flex-nowrap items-center gap-x-1.5 gap-y-0.5">
      <span className={quiet ? "text-muted-foreground" : undefined}>{label}</span>
      {tag ? <span className={`seasonal-tag ${quiet ? "text-muted-foreground" : "text-seasonal-gold"}`}>{tag}</span> : null}
    </span>
  );
}
