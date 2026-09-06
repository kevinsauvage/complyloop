import { shippedCatalog } from "@complyloop/adapters/catalog";
import type { Db } from "./db";

/** Attaches the compile-time adapter catalog to a Postgres-loaded workspace slice. */
export function withShippedCatalog<T extends Omit<Db, "frameworks" | "controls">>(
  slice: T,
): Db {
  const catalog = shippedCatalog();
  return { ...slice, ...catalog };
}
