import { observeOperation } from "~/telemetry/runtime";
import { env } from "~/env";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { createDatabase } from "~/db/database";
import {
  billingCheckout,
  billingCustomer,
  billingPaidPeriod,
  billingSubscription,
  user,
} from "~/db/schema";
import { verifyBillingCatalog } from "~/billing/catalog";
// Provider writes are intentionally sequential within each customer queue.
// oxlint-disable eslint/no-await-in-loop
import type { OrderSubscription } from "@polar-sh/sdk/models/components/ordersubscription";
import type { Order } from "@polar-sh/sdk/models/components/order";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { BillingActionError, polarClient, productId, productInterval } from "~/billing/config";
import type { BillingInterval } from "~/billing/access";

export async function saveSubscription(
  binding: D1Database,
  userId: string,
  subscription: Subscription,
) {
  return observeOperation(
    "billing.saveSubscription",
    async () => {
      const interval = productInterval(subscription.productId);
      if (
        !interval ||
        subscription.product.organizationId !== env.POLAR_ORGANIZATION_ID ||
        subscription.customer.externalId !== userId
      ) {
        return;
      }
      const db = createDatabase(binding);
      const snapshot = {
        interval,
        status: subscription.status,
        periodStart: subscription.currentPeriodStart.getTime(),
        periodEnd: subscription.currentPeriodEnd.getTime(),
        cancelAtPeriodEnd: Number(subscription.cancelAtPeriodEnd),
        revoked: Number(
          subscription.endedAt !== null ||
            subscription.status === "canceled" ||
            subscription.status === "incomplete_expired",
        ),
        pendingInterval: productInterval(subscription.pendingUpdate?.productId ?? null),
        pendingAt: subscription.pendingUpdate?.appliesAt.getTime() ?? null,
        modifiedAt: (subscription.modifiedAt ?? subscription.createdAt).getTime(),
      };
      await db
        .insert(billingSubscription)
        .values({ id: subscription.id, userId, ...snapshot })
        .onConflictDoUpdate({
          target: billingSubscription.id,
          set: {
            ...snapshot,
            cancelAtPeriodEnd: sql`case when ${snapshot.modifiedAt} = ${billingSubscription.modifiedAt} then max(${billingSubscription.cancelAtPeriodEnd}, ${snapshot.cancelAtPeriodEnd}) else ${snapshot.cancelAtPeriodEnd} end`,
            revoked: sql`max(${billingSubscription.revoked}, ${snapshot.revoked})`,
          },
          setWhere: and(
            lte(billingSubscription.modifiedAt, snapshot.modifiedAt),
            eq(billingSubscription.userId, userId),
          ),
        });
    },
    { component: "billing", category: "integration" },
  );
}

// A paid order must belong to this billing period. Reading a historical order's live
// subscription must never accidentally grant a newer, unpaid renewal period.
export function paidOrderPeriod(
  order: Pick<
    Order,
    | "paid"
    | "billingReason"
    | "subscriptionId"
    | "customerId"
    | "currency"
    | "netAmount"
    | "discountAmount"
    | "createdAt"
  >,
  subscription: Pick<
    OrderSubscription,
    "id" | "customerId" | "currentPeriodStart" | "currentPeriodEnd"
  >,
) {
  if (
    !order.paid ||
    !["subscription_create", "subscription_cycle"].includes(order.billingReason) ||
    order.subscriptionId !== subscription.id ||
    order.customerId !== subscription.customerId ||
    order.currency !== "usd" ||
    order.netAmount <= 0 ||
    order.discountAmount !== 0 ||
    order.createdAt < subscription.currentPeriodStart ||
    order.createdAt >= subscription.currentPeriodEnd
  ) {
    return null;
  }
  return {
    start: subscription.currentPeriodStart.getTime(),
    end: subscription.currentPeriodEnd.getTime(),
  };
}

export async function savePaidOrder(
  binding: D1Database,
  order: Order,
  subscription: OrderSubscription,
) {
  return observeOperation(
    "billing.savePaidOrder",
    async () => {
      if (
        !productInterval(order.productId) ||
        order.product?.organizationId !== env.POLAR_ORGANIZATION_ID
      ) {
        return;
      }
      const interval = productInterval(order.productId);
      const amount = interval === "month" ? 500 : 5000;
      // Polar includes tax in the listed price in some countries and adds it in others.
      if (order.netAmount !== amount && order.totalAmount !== amount) {
        return;
      }
      const period = paidOrderPeriod(order, subscription);
      const refunded = order.refundedAmount >= order.netAmount && order.netAmount > 0;
      const db = createDatabase(binding);
      const modifiedAt = (order.modifiedAt ?? order.createdAt).getTime();
      const update = {
        refunded: sql`max(${billingPaidPeriod.refunded}, ${Number(refunded)})`,
        modifiedAt,
      };
      // Keep recorded historical periods intact when the provider has advanced its period.
      if (!period) {
        await db
          .update(billingPaidPeriod)
          .set(update)
          .where(
            and(
              eq(billingPaidPeriod.orderId, order.id),
              lte(billingPaidPeriod.modifiedAt, modifiedAt),
            ),
          );
        return;
      }
      await db
        .insert(billingPaidPeriod)
        .values({
          orderId: order.id,
          subscriptionId: subscription.id,
          periodStart: period.start,
          periodEnd: period.end,
          refunded: Number(refunded),
          modifiedAt,
        })
        .onConflictDoUpdate({
          target: billingPaidPeriod.orderId,
          set: update,
          setWhere: lte(billingPaidPeriod.modifiedAt, modifiedAt),
        });
    },
    { component: "billing", category: "integration" },
  );
}

export async function reconcileCustomer(binding: D1Database, userId: string) {
  return observeOperation(
    "billing.reconcileCustomer",
    async () => {
      const db = createDatabase(binding);
      const mapping = await db
        .select({ customerId: billingCustomer.customerId })
        .from(billingCustomer)
        .where(eq(billingCustomer.userId, userId))
        .get();
      if (!mapping) {
        return;
      }
      const polar = polarClient();
      const subscriptions = new Map<string, Subscription>();
      for await (const page of await polar.subscriptions.list({
        customerId: mapping.customerId,
        organizationId: env.POLAR_ORGANIZATION_ID,
        limit: 100,
      })) {
        for (const subscription of page.result.items) {
          if (
            !productInterval(subscription.productId) ||
            subscription.customer.externalId !== userId
          ) {
            continue;
          }
          await saveSubscription(binding, userId, subscription);
          subscriptions.set(subscription.id, subscription);
        }
      }
      for await (const page of await polar.orders.list({
        customerId: mapping.customerId,
        organizationId: env.POLAR_ORGANIZATION_ID,
        limit: 100,
      })) {
        for (const order of page.result.items) {
          const subscription = subscriptions.get(order.subscriptionId ?? "");
          if (subscription) {
            await savePaidOrder(binding, order, subscription);
          }
        }
      }
    },
    { component: "billing", category: "integration" },
  );
}

async function customer(binding: D1Database, userId: string) {
  const db = createDatabase(binding);
  const polar = polarClient();
  let result;
  try {
    result = await polar.customers.getExternal({ externalId: userId });
  } catch (error) {
    if (!(error instanceof PolarError) || error.statusCode !== 404) {
      throw error;
    }
    const account = await db
      .select({ email: user.email, emailVerified: user.emailVerified, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .get();
    if (!account) {
      throw new BillingActionError("Account not found.", { cause: error });
    }
    if (!account.emailVerified) {
      throw new BillingActionError("Verify your email address before subscribing.");
    }
    const customers = await polar.customers.list({
      email: account.email,
      organizationId: env.POLAR_ORGANIZATION_ID,
      limit: 2,
    });
    if (customers.result.items.length > 1) {
      throw new BillingActionError("Multiple billing customers match your email. Contact support.");
    }
    const existing = customers.result.items[0];
    if (existing) {
      if (
        existing.organizationId !== env.POLAR_ORGANIZATION_ID ||
        existing.email?.toLowerCase() !== account.email.toLowerCase() ||
        (existing.externalId !== null && existing.externalId !== userId)
      ) {
        throw new BillingActionError(
          "This billing customer is linked to another account. Contact support.",
        );
      }
      result =
        existing.externalId === userId
          ? existing
          : await polar.customers.update({
              id: existing.id,
              customerUpdate: { externalId: userId },
            });
    } else {
      result = await polar.customers.create({
        externalId: userId,
        email: account.email,
        name: account.name,
      });
    }
  }
  if (result.organizationId !== env.POLAR_ORGANIZATION_ID || result.externalId !== userId) {
    throw new BillingActionError("Billing customer mismatch.");
  }
  await db
    .insert(billingCustomer)
    .values({ userId, customerId: result.id })
    .onConflictDoNothing({ target: billingCustomer.userId });
  return result;
}

export type BillingAction =
  | { kind: "checkout" | "interval"; interval: BillingInterval }
  | { kind: "portal" }
  | { kind: "reconcile" };

// Invoked inside the user's Durable Object queue, including reconciliation and webhooks.
export async function billingOperation(binding: D1Database, userId: string, action: BillingAction) {
  if (action.kind === "reconcile") {
    await reconcileCustomer(binding, userId);
    return { url: null };
  }
  const db = createDatabase(binding);
  const polar = polarClient();
  if (action.kind === "portal") {
    const mapping = await db
      .select({ customerId: billingCustomer.customerId })
      .from(billingCustomer)
      .where(eq(billingCustomer.userId, userId))
      .get();
    if (!mapping) {
      throw new BillingActionError("Subscribe before opening billing management.");
    }
    const session = await polar.customerSessions.create({
      customerId: mapping.customerId,
      returnUrl: new URL("/billing", env.BETTER_AUTH_URL).href,
    });
    return { url: session.customerPortalUrl };
  }
  if (env.BILLING_CHECKOUT_ENABLED !== "true") {
    throw new BillingActionError("Subscriptions are not available yet.");
  }
  await verifyBillingCatalog(polar);
  const owner = await customer(binding, userId);
  await reconcileCustomer(binding, userId);
  const current = await db
    .select({ id: billingSubscription.id, status: billingSubscription.status })
    .from(billingSubscription)
    .where(and(eq(billingSubscription.userId, userId), eq(billingSubscription.revoked, 0)))
    .orderBy(desc(billingSubscription.periodEnd))
    .limit(1)
    .get();
  if (action.kind === "interval") {
    if (!current || current.status !== "active") {
      throw new BillingActionError(
        "Manage your payment or subscription in the customer portal first.",
      );
    }
    const subscription = await polar.subscriptions.update({
      id: current.id,
      subscriptionUpdate: {
        productId: productId(action.interval),
        prorationBehavior: "next_period",
      },
    });
    await saveSubscription(binding, userId, subscription);
    return { url: null };
  }
  if (current) {
    throw new BillingActionError(
      "You already have a subscription. Use Manage billing to update payment or cancel.",
    );
  }
  const attempt = await db
    .select({ startedAt: billingCheckout.startedAt })
    .from(billingCheckout)
    .where(eq(billingCheckout.userId, userId))
    .get();
  for await (const page of await polar.checkouts.list({
    customerId: owner.id,
    organizationId: env.POLAR_ORGANIZATION_ID,
    limit: 100,
  })) {
    for (const checkout of page.result.items) {
      if (!productInterval(checkout.productId)) {
        continue;
      }
      if (checkout.status === "confirmed") {
        throw new BillingActionError(
          "Confirming payment. Please wait before starting another checkout.",
        );
      }
      if (checkout.status === "open" && checkout.expiresAt.getTime() > Date.now()) {
        const resumed = await polar.checkouts.update({
          id: checkout.id,
          checkoutUpdate: {
            productId: productId(action.interval),
            allowTrial: false,
            allowDiscountCodes: false,
            discountId: null,
            currency: "usd",
          },
        });
        return { url: resumed.url };
      }
    }
  }
  if (attempt && Date.now() - attempt.startedAt < 60 * 60 * 1000) {
    throw new BillingActionError(
      "A checkout is still being prepared. Please retry shortly or contact support.",
    );
  }
  const attemptId = crypto.randomUUID();
  const pending = { attemptId, interval: action.interval, startedAt: Date.now(), checkoutId: null };
  await db
    .insert(billingCheckout)
    .values({ userId, ...pending })
    .onConflictDoUpdate({ target: billingCheckout.userId, set: pending });
  const checkout = await polar.checkouts.create({
    customerId: owner.id,
    externalCustomerId: userId,
    products: [
      productId(action.interval),
      productId(action.interval === "month" ? "year" : "month"),
    ],
    currency: "usd",
    allowTrial: false,
    allowDiscountCodes: false,
    successUrl: new URL("/billing?confirming=1", env.BETTER_AUTH_URL).href,
    returnUrl: new URL("/billing", env.BETTER_AUTH_URL).href,
    metadata: { sidequestAttemptId: attemptId },
  });
  await db
    .update(billingCheckout)
    .set({ checkoutId: checkout.id })
    .where(and(eq(billingCheckout.userId, userId), eq(billingCheckout.attemptId, attemptId)));
  return { url: checkout.url };
}
