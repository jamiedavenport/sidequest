import { annotateOperation, captureTelemetryContext, observeOperation } from "~/telemetry/runtime";
import { env } from "~/env";
import { eq } from "drizzle-orm";
import { createDatabase } from "~/db/database";
import { billingCustomer } from "~/db/schema";
import { Subscription$inboundSchema } from "@polar-sh/sdk/models/components/subscription";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { Order$inboundSchema } from "@polar-sh/sdk/models/components/order";
import { Schema } from "effect";
import { productInterval } from "~/billing/config";
import { savePaidOrder, saveSubscription, reconcileCustomer } from "~/billing/provider";

const billingWebhookEvents = [
  "order.paid",
  "order.updated",
  "order.refunded",
  "customer.state_changed",
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
] as const;

type WorkerBindings = Pick<Env, "DB" | "BOARD">;

export async function receiveBillingWebhook(request: Request, bindings: WorkerBindings) {
  if (!env.POLAR_WEBHOOK_SECRET) {
    return new Response("Webhook not configured", { status: 503 });
  }
  const body = await request.text();
  let event;
  try {
    event = validateEvent(
      body,
      Object.fromEntries(request.headers.entries()),
      env.POLAR_WEBHOOK_SECRET,
    );
  } catch (error) {
    return new Response("Invalid webhook", {
      status: error instanceof WebhookVerificationError ? 403 : 400,
    });
  }
  const id = request.headers.get("webhook-id");
  if (!id) {
    return new Response("Missing webhook ID", { status: 400 });
  }
  if (!billingWebhookEvents.some((type) => type === event.type)) {
    return new Response(null, { status: 204 });
  }
  annotateOperation({
    eventId: id,
    eventType: event.type,
    component: "billing",
    provider: "polar",
  });
  let userId: string | null = null;
  if ("customer" in event.data && "externalId" in event.data.customer) {
    userId = event.data.customer.externalId ?? null;
  } else if ("externalId" in event.data) {
    userId = event.data.externalId ?? null;
  }
  try {
    if (userId) {
      const mapping = await createDatabase(bindings.DB)
        .select({ userId: billingCustomer.userId })
        .from(billingCustomer)
        .where(eq(billingCustomer.userId, userId))
        .get();
      if (mapping) {
        const accountId = userId;
        await observeOperation(
          "billing.webhook",
          () =>
            bindings.BOARD.getByName(accountId).processBillingEvent(
              accountId,
              body,
              captureTelemetryContext(),
            ),
          { component: "billing", category: "webhook", eventId: id, accountId },
        );
      }
    }
    return new Response(null, { status: 204 });
  } catch {
    annotateOperation({
      outcome: "unexpected_failure",
      failureStage: "billing_reconciliation",
      eventId: id,
    });
    return new Response("Webhook processing failed", { status: 500 });
  }
}

// Called only with the signature-verified body from the webhook route.
export async function processCustomerEvent(binding: D1Database, userId: string, body: string) {
  const event = Schema.decodeUnknownSync(
    Schema.Struct({ type: Schema.String, data: Schema.Unknown }),
  )(JSON.parse(body));
  if (event.type.startsWith("subscription.")) {
    await saveSubscription(binding, userId, Subscription$inboundSchema.parse(event.data));
  }
  if (event.type.startsWith("order.")) {
    const order = Order$inboundSchema.parse(event.data);
    if (order.customer.externalId !== userId) {
      throw new Error("Billing event account mismatch.");
    }
    if (
      productInterval(order.productId) &&
      order.product?.organizationId === env.POLAR_ORGANIZATION_ID &&
      order.subscription
    ) {
      // Preserve the event's original paid period before fetching the latest state.
      await savePaidOrder(binding, order, order.subscription);
    }
  }
  await reconcileCustomer(binding, userId);
}
