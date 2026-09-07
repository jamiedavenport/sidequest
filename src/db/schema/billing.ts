import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const billingCustomer = sqliteTable("billing_customer", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().unique(),
});

export const billingSubscription = sqliteTable(
  "billing_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    interval: text("interval", { enum: ["month", "year"] }).notNull(),
    status: text("status").notNull(),
    periodStart: integer("period_start").notNull(),
    periodEnd: integer("period_end").notNull(),
    cancelAtPeriodEnd: integer("cancel_at_period_end").notNull(),
    revoked: integer("revoked").notNull(),
    pendingInterval: text("pending_interval", { enum: ["month", "year"] }),
    pendingAt: integer("pending_at"),
    modifiedAt: integer("modified_at").notNull(),
  },
  (table) => [index("billing_subscription_user_idx").on(table.userId)],
);

export const billingPaidPeriod = sqliteTable(
  "billing_paid_period",
  {
    orderId: text("order_id").primaryKey(),
    subscriptionId: text("subscription_id").notNull(),
    periodStart: integer("period_start").notNull(),
    periodEnd: integer("period_end").notNull(),
    refunded: integer("refunded").notNull(),
    modifiedAt: integer("modified_at").notNull(),
  },
  (table) => [index("billing_paid_period_subscription_idx").on(table.subscriptionId)],
);

export const billingCheckout = sqliteTable("billing_checkout", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull(),
  checkoutId: text("checkout_id"),
  interval: text("interval", { enum: ["month", "year"] }).notNull(),
  startedAt: integer("started_at").notNull(),
});
