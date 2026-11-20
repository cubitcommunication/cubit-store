import { api } from "../api";
import type { Descriptor, Result } from "./descriptor";

/**
 * Single entry point for database reads and writes. The description is sent to
 * the PHP API, which decides what is allowed before any SQL runs.
 */
export const runQuery = ({ data }: { data: Descriptor }): Promise<Result> =>
  api<Result>("/query", { method: "POST", body: data });
