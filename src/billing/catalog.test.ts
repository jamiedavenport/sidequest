// Test catalog fixtures omit provider fields irrelevant to pricing validation.
// oxlint-disable typescript/no-unsafe-type-assertion
import { expect, it, vi } from "vitest";
import type { Product } from "@polar-sh/sdk/models/components/product";
import { assertBillingProduct } from "~/billing/catalog";

vi.mock("~/env", () => ({ env: {} }));

function product(patch: Record<string, unknown> = {}, pricePatch: Record<string, unknown> = {}) {
  return {
    organizationId: "org",
    isArchived: false,
    isRecurring: true,
    recurringInterval: "month",
    recurringIntervalCount: 1,
    trialInterval: null,
    prices: [
      {
        isArchived: false,
        amountType: "fixed",
        priceCurrency: "usd",
        priceAmount: 500,
        taxBehavior: "location",
        ...pricePatch,
      },
    ],
    ...patch,
  } as unknown as Product;
}

it("requires the exact approved amount, USD and location-based tax", () => {
  expect(() => assertBillingProduct(product(), "org", "month")).not.toThrow();
  expect(() =>
    assertBillingProduct(product({}, { taxBehavior: null }), "org", "month"),
  ).not.toThrow();
  expect(() =>
    assertBillingProduct(
      product({ recurringInterval: "year" }, { priceAmount: 5000 }),
      "org",
      "year",
    ),
  ).not.toThrow();
});
it.each([
  { priceAmount: 5 },
  { priceCurrency: "eur" },
  { taxBehavior: "inclusive" },
  { taxBehavior: "exclusive" },
  { amountType: "custom" },
])("rejects a mismatched price: %o", (patch) => {
  expect(() => assertBillingProduct(product({}, patch), "org", "month")).toThrow();
});
it.each([
  { organizationId: "other" },
  { trialInterval: "day" },
  { recurringInterval: "year" },
  { recurringIntervalCount: 2 },
  { isArchived: true },
  { isRecurring: false },
])("rejects an invalid product: %o", (patch) => {
  expect(() => assertBillingProduct(product(patch), "org", "month")).toThrow();
});
