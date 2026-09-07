import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";

export class BillingActionError extends Error {}

export function polarClient() {
  if (!env.POLAR_ACCESS_TOKEN || !env.POLAR_ORGANIZATION_ID || !env.POLAR_SERVER) {
    throw new BillingActionError("Polar billing is not configured.");
  }
  return new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: env.POLAR_SERVER,
  });
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
