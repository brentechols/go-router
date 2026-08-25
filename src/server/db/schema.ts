import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const goRouterSchema = pgSchema("go_router");

export const routes = goRouterSchema.table(
  "routes",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    destinationTemplate: text("destination_template").notNull(),
    description: text("description").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    hitCount: bigint("hit_count", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("routes_created_at_id_idx").on(table.createdAt, table.id),
    index("routes_updated_at_id_idx").on(table.updatedAt, table.id),
    index("routes_hit_count_id_idx").on(table.hitCount, table.id),
    index("routes_last_used_sort_id_idx").using(
      "btree",
      sql`COALESCE(${table.lastUsedAt}, '-infinity'::timestamptz)`,
      table.id,
    ),
    index("routes_description_trgm_idx").using("gin", sql`${table.description} gin_trgm_ops`),
    index("routes_destination_template_trgm_idx").using(
      "gin",
      sql`${table.destinationTemplate} gin_trgm_ops`,
    ),
    index("routes_tags_gin_idx").using("gin", table.tags),
  ],
);

export const routeNames = goRouterSchema.table(
  "route_names",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    routeId: bigint("route_id", { mode: "bigint" })
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 64 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("route_names_normalized_name_uidx").on(table.normalizedName),
    uniqueIndex("route_names_one_primary_per_route_uidx")
      .on(table.routeId)
      .where(sql`${table.isPrimary} = true`),
    index("route_names_route_id_idx").on(table.routeId),
    index("route_names_primary_name_route_id_idx")
      .on(table.name, table.routeId)
      .where(sql`${table.isPrimary} = true`),
    index("route_names_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
  ],
);

export type RouteRow = typeof routes.$inferSelect;
export type RouteNameRow = typeof routeNames.$inferSelect;
