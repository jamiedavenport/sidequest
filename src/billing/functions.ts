import { captureTelemetryContext } from "~/telemetry/runtime";
import { assertBillingOrigin } from "~/billing/security";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env as bindings } from "cloudflare:workers";
import { env } from "~/env";
import { Schema } from "effect";
import { createAuth } from "~/auth/server";
import { readBillingAccess } from "~/billing/store";
import { canWrite } from "~/billing/access";

async function billingUser(mutation = false) {
  const headers = getRequestHeaders();
  if (mutation) {
    assertBillingOrigin(headers, env.BETTER_AUTH_URL.href);
  }
  const session = await createAuth().api.getSession({ headers });
  if (!session) {
    throw new Error("Sign in to manage billing.");
  }
  return session.user.id;
}

export const getBillingStatus = createServerFn({ method: "GET" }).handler(async () =>
  readBillingAccess(bindings.DB, await billingUser()),
);

export const requireBoardAccess = createServerFn({ method: "GET" }).handler(async () => {
  const access = await readBillingAccess(bindings.DB, await billingUser());
  if (!canWrite(access)) {
    throw redirect({ to: "/billing" });
  }
});

const Interval = Schema.toStandardSchemaV1(
  Schema.Struct({ interval: Schema.Literals(["month", "year"]) }),
);

export const createBillingCheckout = createServerFn({ method: "POST" })
  .validator(Interval)
  .handler(async ({ data }) => {
    const userId = await billingUser(true);
    const result = await bindings.BOARD.getByName(userId).billing(
      userId,
      {
        kind: "checkout",
        interval: data.interval,
      },
      captureTelemetryContext(),
    );
    return { url: result.url };
  });

export const scheduleBillingInterval = createServerFn({ method: "POST" })
  .validator(Interval)
  .handler(async ({ data }) => {
    const userId = await billingUser(true);
    await bindings.BOARD.getByName(userId).billing(
      userId,
      {
        kind: "interval",
        interval: data.interval,
      },
      captureTelemetryContext(),
    );
    return readBillingAccess(bindings.DB, userId);
  });

export const createBillingPortal = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await billingUser(true);
  const result = await bindings.BOARD.getByName(userId).billing(
    userId,
    { kind: "portal" },
    captureTelemetryContext(),
  );
  return { url: result.url };
});

export const refreshBillingStatus = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await billingUser(true);
  await bindings.BOARD.getByName(userId).billing(
    userId,
    { kind: "reconcile" },
    captureTelemetryContext(),
  );
  return readBillingAccess(bindings.DB, userId);
});
