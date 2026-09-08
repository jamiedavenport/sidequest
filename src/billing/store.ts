import { observeOperation } from "~/telemetry/runtime";
import { env } from "~/env";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { deriveAccess, type SubscriptionAccess } from "~/billing/access";
import { createDatabase } from "~/db/database";
import { billingPaidPeriod, billingSubscription, user } from "~/db/schema";

export async function readBillingAccess(binding: D1Database, userId: string) {
  return observeOperation(
    "d1.readBillingAccess",
    async () => {
      const db = createDatabase(binding);
      const account = await db
        .select({ createdAt: user.createdAt })
        .from(user)
        .where(eq(user.id, userId))
        .get();
      if (!account) {
        throw new Error("Account not found.");
      }
      const rows = await db
        .select({
          ...getTableColumns(billingSubscription),
          paidThrough: sql<
            number | null
          >`max(case when ${billingPaidPeriod.refunded} = 0 then ${billingPaidPeriod.periodEnd} end)`,
          refundedThrough: sql<
            number | null
          >`max(case when ${billingPaidPeriod.refunded} = 1 then ${billingPaidPeriod.periodEnd} end)`,
        })
        .from(billingSubscription)
        .leftJoin(billingPaidPeriod, eq(billingPaidPeriod.subscriptionId, billingSubscription.id))
        .where(eq(billingSubscription.userId, userId))
        .groupBy(billingSubscription.id);
      const subscriptions: SubscriptionAccess[] = rows.map((row) => ({
        id: row.id,
        interval: row.interval,
        paidThrough: row.paidThrough,
        cancelAtPeriodEnd: !!row.cancelAtPeriodEnd,
        revoked:
          !!row.revoked ||
          (row.refundedThrough !== null && row.refundedThrough > (row.paidThrough ?? 0)),
        pendingRenewal:
          row.pendingInterval && row.pendingAt
            ? { interval: row.pendingInterval, appliesAt: row.pendingAt }
            : null,
      }));
      return deriveAccess({
        userId,
        createdAt: account.createdAt.getTime(),
        subscriptions,
        now: Date.now(),
        enforcement: env.BILLING_ENFORCEMENT_ENABLED === "true",
        checkoutEnabled: env.BILLING_CHECKOUT_ENABLED === "true",
      });
    },
    { component: "d1", category: "storage" },
  );
}
