import { drizzle } from "drizzle-orm/d1";

import * as schema from "~/db/schema";

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}
