import { runQuery } from "./query.functions";
import type { Descriptor, Filter, Result } from "./descriptor";

/**
 * A very small, deliberately limited stand-in for the query builder the app used
 * before. It only builds a description of the request; the Worker decides what is
 * allowed and turns it into SQL against Cloudflare D1.
 */
class QueryBuilder<T = any> implements PromiseLike<Result<T>> {
  private d: Descriptor;

  constructor(d: Descriptor) {
    this.d = d;
  }

  private add(filter: Filter) {
    this.d.filters.push(filter);
    return this;
  }

  select(fields = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.d.fields = fields || "*";
    this.d.returning = true;
    if (opts?.count) this.d.count = true;
    if (opts?.head) this.d.head = true;
    return this;
  }

  eq(col: string, value: unknown) { return this.add({ op: "eq", col, value }); }
  neq(col: string, value: unknown) { return this.add({ op: "neq", col, value }); }
  gt(col: string, value: unknown) { return this.add({ op: "gt", col, value }); }
  gte(col: string, value: unknown) { return this.add({ op: "gte", col, value }); }
  lt(col: string, value: unknown) { return this.add({ op: "lt", col, value }); }
  lte(col: string, value: unknown) { return this.add({ op: "lte", col, value }); }
  like(col: string, value: string) { return this.add({ op: "like", col, value }); }
  ilike(col: string, value: string) { return this.add({ op: "ilike", col, value }); }
  in(col: string, value: unknown[]) { return this.add({ op: "in", col, value }); }
  is(col: string, value: null | boolean) { return this.add({ op: "is", col, value }); }
  or(parts: string) { return this.add({ op: "or", parts }); }

  not(col: string, op: "is", value: null | boolean) {
    if (op !== "is") throw new Error("Unsupported filter");
    return this.add({ op: "not_is", col, value });
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.d.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  limit(n: number) { this.d.limit = n; return this; }

  range(from: number, to: number) {
    this.d.offset = from;
    this.d.limit = to - from + 1;
    return this;
  }

  single() { this.d.single = "one"; return this as unknown as QueryBuilder<T>; }
  maybeSingle() { this.d.single = "maybe"; return this as unknown as QueryBuilder<T>; }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return runQuery({ data: this.d })
      .then((result: unknown) => result as Result<T>)
      .then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

function base(table: string, action: Descriptor["action"]): Descriptor {
  return {
    table,
    action,
    fields: "*",
    count: false,
    head: false,
    filters: [],
    orders: [],
    returning: action === "select",
  };
}

export const db = {
  from(table: string) {
    return {
      select(fields = "*", opts?: { count?: "exact"; head?: boolean }) {
        return new QueryBuilder(base(table, "select")).select(fields, opts);
      },
      insert(values: Record<string, unknown> | Record<string, unknown>[]) {
        return new QueryBuilder({ ...base(table, "insert"), values, returning: false });
      },
      upsert(
        values: Record<string, unknown> | Record<string, unknown>[],
        opts?: { onConflict?: string },
      ) {
        const descriptor: Descriptor = { ...base(table, "upsert"), values, returning: false };
        if (opts?.onConflict) descriptor.onConflict = opts.onConflict;
        return new QueryBuilder(descriptor);
      },
      update(values: Record<string, unknown>) {
        return new QueryBuilder({ ...base(table, "update"), values, returning: false });
      },
      delete() {
        return new QueryBuilder({ ...base(table, "delete"), returning: false });
      },
    };
  },
};
