import { assertBillingOrigin } from "~/billing/security";
import { createTestDatabase } from "~/db/test-database";
import { billingPaidPeriod, billingSubscription, user } from "~/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBillingAccess } from "~/billing/store";
import { DAY } from "~/billing/access";

vi.mock("~/env", () => ({
  env: {
    BILLING_ENFORCEMENT_ENABLED: "true",
  },
}));

let database: ReturnType<typeof createTestDatabase>;

const now = Date.now();

beforeEach(async () => {
  database = createTestDatabase();
  await database.db.insert(user).values({
    id: "user",
    name: "User",
    email: "user@example.test",
    createdAt: new Date(now - 100 * DAY),
  });
});
afterEach(() => database.close());

async function seed(refunded = 0) {
  await database.db.insert(billingSubscription).values({
    id: "sub",
    userId: "user",
    interval: "month",
    status: "active",
    periodStart: now - DAY,
    periodEnd: now + 29 * DAY,
    cancelAtPeriodEnd: 0,
    revoked: 0,
    modifiedAt: now,
  });
  await database.db.insert(billingPaidPeriod).values({
    orderId: "order",
    subscriptionId: "sub",
    periodStart: now - DAY,
    periodEnd: now + 29 * DAY,
    refunded,
    modifiedAt: now,
  });
}

describe("D1 access projection", () => {
  it("does not reset an existing expired user's trial", async () => {
    expect((await readBillingAccess(database.DB, "user")).state).toBe("expired");
  });
  it("requires paid evidence independently of subscription status", async () => {
    await seed();
    await database.db.delete(billingPaidPeriod);
    expect((await readBillingAccess(database.DB, "user")).state).toBe("expired");
  });
  it("revokes a fully refunded current period rather than falling back to an older grant", async () => {
    await seed(1);
    await database.db.insert(billingPaidPeriod).values({
      orderId: "older",
      subscriptionId: "sub",
      periodStart: now - 31 * DAY,
      periodEnd: now - DAY,
      refunded: 0,
      modifiedAt: now,
    });
    expect((await readBillingAccess(database.DB, "user")).state).toBe("revoked");
  });
  it("retains unrefunded grants and isolates accounts", async () => {
    await seed();
    await database.db.insert(user).values({
      id: "other",
      name: "Other",
      email: "other@example.test",
      createdAt: new Date(now - 100 * DAY),
    });
    expect((await readBillingAccess(database.DB, "user")).state).toBe("paid");
    expect((await readBillingAccess(database.DB, "other")).state).toBe("expired");
  });
});

it.each([null, "https://evil.test", "https://sdqst.app.evil.test", "null"])(
  "rejects cross-origin billing mutations: %s",
  (origin) => {
    const headers = new Headers();
    if (origin) {
      headers.set("origin", origin);
    }
    expect(() => assertBillingOrigin(headers, "https://sdqst.app")).toThrow(
      "Origin is not allowed",
    );
  },
);

it("allows same-origin billing mutations", () => {
  expect(() =>
    assertBillingOrigin(new Headers({ origin: "https://sdqst.app" }), "https://sdqst.app"),
  ).not.toThrow();
});
