import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export * from "./schema";
// Re-exported so apps use this package's drizzle-orm instance (a second copy breaks the types).
export { and, asc, count, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
export { schema };

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
