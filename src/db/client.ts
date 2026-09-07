import { env } from "cloudflare:workers";
import { createDatabase } from "~/db/database";

export const db = createDatabase(env.DB);
