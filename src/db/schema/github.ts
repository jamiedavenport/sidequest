import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const githubConnection = sqliteTable(
  "github_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    laneId: text("lane_id").notNull(),
    installationId: integer("installation_id").notNull(),
    repositoryId: integer("repository_id").notNull(),
    // GitHub full name in owner/name format, e.g. "octocat/Hello-World".
    repository: text("repository").notNull(),
    onlyAssigned: integer("only_assigned", { mode: "boolean" }).notNull().default(false),
    labels: text("labels", { mode: "json" }).$type<string[]>().notNull(),
  },
  (table) => [
    uniqueIndex("github_connection_user_lane").on(table.userId, table.laneId),
    uniqueIndex("github_connection_user_repository").on(table.userId, table.repositoryId),
    index("github_connection_routing").on(table.installationId, table.repositoryId),
  ],
);

export type GitHubConnection = typeof githubConnection.$inferSelect;
