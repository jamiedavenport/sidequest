import { HTTPClient } from "@polar-sh/sdk/lib/http";
import { annotateOperation, observeOperation } from "~/telemetry/runtime";
import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";

export class BillingActionError extends Error {}

export function polarClient() {
  if (!env.POLAR_ACCESS_TOKEN || !env.POLAR_ORGANIZATION_ID || !env.POLAR_SERVER) {
    throw new BillingActionError("Polar billing is not configured.");
  }
  return new Polar({
    httpClient: new HTTPClient({
      fetcher: (input, init) =>
        observeOperation(
          "polar.request",
          async () => {
            const response = await fetch(input, init);
            annotateOperation({
              status: response.status,
              outcome: getPolarOutcome(response.status),
              upstreamRequestId: response.headers.get("x-request-id") ?? undefined,
            });
            return response;
          },
          { component: "billing", provider: "polar", category: "integration" },
        ),
    }),
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: env.POLAR_SERVER,
  });
}

function getPolarOutcome(status: number) {
  if (status >= 500 || status === 429) {
    return "unexpected_failure";
  }
  if (status >= 400) {
    return "expected_rejection";
  }
  return "success";
}

export function productInterval(id: string | null) {
  if (id && id === env.POLAR_MONTHLY_PRODUCT_ID) {
    return "month" as const;
  }
  if (id && id === env.POLAR_ANNUAL_PRODUCT_ID) {
    return "year" as const;
  }
  return null;
}

export function productId(interval: "month" | "year") {
  const id = interval === "month" ? env.POLAR_MONTHLY_PRODUCT_ID : env.POLAR_ANNUAL_PRODUCT_ID;
  if (!id) {
    throw new BillingActionError("Billing product is not configured.");
  }
  return id;
}
