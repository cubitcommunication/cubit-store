/** Shape of a database request sent from the browser to the Worker. */

export type Filter =
  | { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike"; col: string; value: unknown }
  | { op: "is"; col: string; value: null | boolean }
  | { op: "not_is"; col: string; value: null | boolean }
  | { op: "in"; col: string; value: unknown[] }
  | { op: "or"; parts: string };

export type Order = { col: string; ascending: boolean };

export type Descriptor = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  fields: string;
  count: boolean;
  head: boolean;
  filters: Filter[];
  orders: Order[];
  limit?: number;
  offset?: number;
  single?: "one" | "maybe";
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  returning: boolean;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type Result<T = Json> = {
  data: T | null;
  error: { message: string; code?: string } | null;
  count: number | null;
};
