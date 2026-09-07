import { env } from "~/env";
import type { Product } from "@polar-sh/sdk/models/components/product";
import type { Polar } from "@polar-sh/sdk";
import { BillingActionError, productId } from "~/billing/config";
import type { BillingInterval } from "~/billing/access";

export function assertBillingProduct(
  product: Product,
  organizationId: string,
  interval: BillingInterval,
) {
  const prices = product.prices.filter((price) => !price.isArchived);
  const price = prices[0];
  if (
    product.organizationId !== organizationId ||
    product.isArchived ||
    !product.isRecurring ||
    product.recurringInterval !== interval ||
    product.recurringIntervalCount !== 1 ||
    product.trialInterval !== null ||
    prices.length !== 1 ||
    !price ||
    price.amountType !== "fixed" ||
    price.priceCurrency !== "usd" ||
    price.priceAmount !== (interval === "month" ? 500 : 5000) ||
    (price.taxBehavior !== "location" && price.taxBehavior !== null)
  ) {
    throw new BillingActionError(
      "Sidequest billing product does not match the approved pricing and tax configuration.",
    );
  }
}

export async function verifyBillingCatalog(polar: Polar) {
  if (!env.POLAR_ORGANIZATION_ID) {
    throw new BillingActionError("Billing organization is missing.");
  }
  const [organization, monthly, annual] = await Promise.all([
    polar.organizations.get({ id: env.POLAR_ORGANIZATION_ID }),
    polar.products.get({ id: productId("month") }),
    polar.products.get({ id: productId("year") }),
  ]);
  assertBillingProduct(monthly, organization.id, "month");
  assertBillingProduct(annual, organization.id, "year");
  if (
    organization.subscriptionSettings.allowMultipleSubscriptions ||
    organization.subscriptionSettings.prorationBehavior !== "next_period" ||
    organization.defaultPresentmentCurrency !== "usd" ||
    organization.defaultTaxBehavior !== "location"
  ) {
    throw new BillingActionError(
      "Polar subscription, currency or tax settings must be verified before checkout.",
    );
  }
  if (
    env.POLAR_SERVER === "production" &&
    (!organization.capabilities.checkoutPayments ||
      !organization.capabilities.subscriptionRenewals ||
      !organization.capabilities.payouts)
  ) {
    throw new BillingActionError(
      "Polar account onboarding and payouts must be completed before checkout.",
    );
  }
}
