import { createContext, useContext } from "react";

/** Content a page block carries for a "site section" (see section-content.ts). Kept apart so the settings hooks can read it. */
export type SectionContent = Record<string, string>;
export const SectionCtx = createContext<SectionContent | null>(null);
export const useSectionContent = () => useContext(SectionCtx);
