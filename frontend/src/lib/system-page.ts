import { useQuery } from "@tanstack/react-query";
import { systemPageQuery, type Block, type SystemKind } from "@/lib/pages";

/** The blocks of a built-in page's published custom design, or null while the built-in design is in use. */
export function useSystemPage(kind: SystemKind): Block[] | null {
  const { data } = useQuery(systemPageQuery(kind));
  return data?.blocks?.length ? data.blocks : null;
}
