// Provider fixtures contain only the fields used by the billing boundary under test.
// oxlint-disable typescript/no-unsafe-type-assertion
import { eq } from "drizzle-orm";
import { createTestDatabase } from "~/db/test-database";
import { billingCustomer, billingPaidPeriod, billingSubscription, user } from "~/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@polar-sh/sdk/models/components/order";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { ResourceNotFound } from "@polar-sh/sdk/models/errors/resourcenotfound";
import { SDKError } from "@polar-sh/sdk/models/errors/sdkerror";
import { billingOperation, savePaidOrder, saveSubscription } from "~/billing/provider";
import { readBillingAccess } from "~/billing/store";
import { DAY } from "~/billing/access";

const mocks = vi.hoisted(() => ({
  getCustomer: vi.fn(),
  listCustomers: vi.fn(),
  updateCustomer: vi.fn(),
  createCustomer: vi.fn(),
  create: vi.fn(),
  listCheckouts: vi.fn(),
  updateCheckout: vi.fn(),
  listSubscriptions: vi.fn(),
  updateSubscription: vi.fn(),
  listOrders: vi.fn(),
}));

vi.mock("~/billing/catalog", () => ({ verifyBillingCatalog: vi.fn(async () => {}) }));
vi.mock("~/billing/config", async (original) => ({
  ...(await original<object>()),
  polarClient: () => ({
    customers: {
      getExternal: mocks.getCustomer,
      list: mocks.listCustomers,
      update: mocks.updateCustomer,
      create: mocks.createCustomer,
    },
    subscriptions: { list: mocks.listSubscriptions, update: mocks.updateSubscription },
    orders: { list: mocks.listOrders },
    checkouts: { list: mocks.listCheckouts, create: mocks.create, update: mocks.updateCheckout },
  }),
}));

vi.mock("~/env", () => ({
  env: {
    BETTER_AUTH_URL: new URL("https://sdqst.app"),
    POLAR_ORGANIZATION_ID: "org",
    POLAR_MONTHLY_PRODUCT_ID: "monthly",
    POLAR_ANNUAL_PRODUCT_ID: "annual",
    BILLING_CHECKOUT_ENABLED: "true",
    BILLING_ENFORCEMENT_ENABLED: "true",
  },
}));

let database: ReturnType<typeof createTestDatabase>;

const now = Date.now();

const subscription = {
  id: "sub",
  customerId: "customer",
  customer: { externalId: "user" },
  productId: "monthly",
  product: { organizationId: "org" },
  createdAt: new Date(now - DAY),
  modifiedAt: new Date(now),
  currentPeriodStart: new Date(now - DAY),
  currentPeriodEnd: new Date(now + 29 * DAY),
  status: "active",
  cancelAtPeriodEnd: false,
  endedAt: null,
  pendingUpdate: null,
} as unknown as Subscription;

const order = {
  id: "order",
  customerId: "customer",
  subscriptionId: "sub",
  productId: "monthly",
  product: { organizationId: "org" },
  paid: true,
  billingReason: "subscription_create",
  createdAt: new Date(now - DAY + 100),
  modifiedAt: new Date(now),
  currency: "usd",
  netAmount: 500,
  discountAmount: 0,
  refundedAmount: 0,
} as unknown as Order;

beforeEach(async () => {
  vi.resetAllMocks();
  database = createTestDatabase();
  await database.db.insert(user).values({
    id: "user",
    createdAt: new Date(now - 100 * DAY),
    email: "user@example.com",
    name: "Test User",
    emailVerified: true,
  });
  mocks.listSubscriptions.mockResolvedValue([{ result: { items: [] } }]);
  mocks.listCustomers.mockResolvedValue({ result: { items: [] } });
  mocks.updateCustomer.mockResolvedValue({
    id: "customer",
    externalId: "user",
    organizationId: "org",
  });
  mocks.getCustomer.mockResolvedValue({
    id: "customer",
    externalId: "user",
    organizationId: "org",
  });
  mocks.createCustomer.mockResolvedValue({
    id: "customer",
    externalId: "user",
    organizationId: "org",
  });
  mocks.listOrders.mockResolvedValue([{ result: { items: [] } }]);
  mocks.listCheckouts.mockResolvedValue([{ result: { items: [] } }]);
  mocks.create.mockResolvedValue({ id: "checkout", url: "https://polar.sh/checkout" });
});
afterEach(() => database.close());

describe("checkout recovery and subscription management", () => {
  it("links an existing unclaimed customer using the account's verified email", async () => {
    mocks.getCustomer.mockRejectedValue(
      new SDKError("Not found", {
        request: new Request("https://sandbox-api.polar.sh/v1/customers/external/user"),
        response: new Response(null, { status: 404 }),
        body: "",
      }),
    );
    mocks.listCustomers.mockResolvedValue({
      result: {
        items: [
          {
            id: "customer",
            externalId: null,
            organizationId: "org",
            email: "user@example.com",
          },
        ],
      },
    });

    await billingOperation(database.DB, "user", { kind: "checkout", interval: "month" });

    expect(mocks.listCustomers).toHaveBeenCalledWith({
      email: "user@example.com",
      organizationId: "org",
      limit: 2,
    });
    expect(mocks.updateCustomer).toHaveBeenCalledWith({
      id: "customer",
      customerUpdate: { externalId: "user" },
    });
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: "customer" }));
  });

  it.each([
    { externalId: "other", organizationId: "org", email: "user@example.com" },
    { externalId: null, organizationId: "other", email: "user@example.com" },
    { externalId: null, organizationId: "org", email: "other@example.com" },
  ])("refuses an existing customer with mismatched ownership: %j", async (customer) => {
    mocks.getCustomer.mockRejectedValue(
      new SDKError("Not found", {
        request: new Request("https://sandbox-api.polar.sh/v1/customers/external/user"),
        response: new Response(null, { status: 404 }),
        body: "",
      }),
    );
    mocks.listCustomers.mockResolvedValue({ result: { items: [{ id: "customer", ...customer }] } });

    await expect(
      billingOperation(database.DB, "user", { kind: "checkout", interval: "month" }),
    ).rejects.toThrow("linked to another account");
    expect(mocks.updateCustomer).not.toHaveBeenCalled();
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not link or create a customer for an unverified email", async () => {
    await database.db.update(user).set({ emailVerified: false }).where(eq(user.id, "user"));
    mocks.getCustomer.mockRejectedValue(
      new SDKError("Not found", {
        request: new Request("https://sandbox-api.polar.sh/v1/customers/external/user"),
        response: new Response(null, { status: 404 }),
        body: "",
      }),
    );

    await expect(
      billingOperation(database.DB, "user", { kind: "checkout", interval: "month" }),
    ).rejects.toThrow("Verify your email");
    expect(mocks.listCustomers).not.toHaveBeenCalled();
    expect(mocks.updateCustomer).not.toHaveBeenCalled();
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it("creates the customer on first checkout when Polar returns its typed 404", async () => {
    const data = { error: "ResourceNotFound", detail: "Customer not found" } as const;
    const body = JSON.stringify(data);
    mocks.getCustomer.mockRejectedValue(
      new ResourceNotFound(data, {
        request: new Request("https://sandbox-api.polar.sh/v1/customers/external/user"),
        response: new Response(body, { status: 404 }),
        body,
      }),
    );

    await expect(
      billingOperation(database.DB, "user", { kind: "checkout", interval: "month" }),
    ).resolves.toEqual({ url: "https://polar.sh/checkout" });
    expect(mocks.createCustomer).toHaveBeenCalledWith({
      externalId: "user",
      email: "user@example.com",
      name: "Test User",
    });
    expect(
      await database.db
        .select({ customerId: billingCustomer.customerId })
        .from(billingCustomer)
        .where(eq(billingCustomer.userId, "user"))
        .get(),
    ).toEqual({ customerId: "customer" });
  });

  it("does not create a customer or checkout when customer lookup is unauthorized", async () => {
    const error = new SDKError("Unauthorized", {
      request: new Request("https://sandbox-api.polar.sh/v1/customers/external/user"),
      response: new Response(null, { status: 401 }),
      body: "",
    });
    mocks.getCustomer.mockRejectedValue(error);

    await expect(
      billingOperation(database.DB, "user", { kind: "checkout", interval: "month" }),
    ).rejects.toBe(error);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("resolves customer, price, currency, returns, discounts and trial on the server", async () => {
    await billingOperation(database.DB, "user", { kind: "checkout", interval: "month" });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "customer",
        externalCustomerId: "user",
        products: ["monthly", "annual"],
        currency: "usd",
        allowTrial: false,
        allowDiscountCodes: false,
        successUrl: "https://sdqst.app/billing?confirming=1",
      }),
    );
  });
  it("resumes an unfinished checkout and selects the requested interval", async () => {
    mocks.listCheckouts.mockResolvedValue([
      {
        result: {
          items: [
            {
              id: "existing",
              productId: "monthly",
              status: "open",
              expiresAt: new Date(now + DAY),
            },
          ],
        },
      },
    ]);
    mocks.updateCheckout.mockResolvedValue({ url: "https://polar.sh/existing" });
    expect(
      await billingOperation(database.DB, "user", { kind: "checkout", interval: "year" }),
    ).toEqual({
      url: "https://polar.sh/existing",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutUpdate: expect.objectContaining({ productId: "annual" }) }),
    );
  });
  it("blocks another checkout after an ambiguous create failure", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Network interrupted"));
    await expect(
      billingOperation(database.DB, "user", { kind: "checkout", interval: "month" }),
    ).rejects.toThrow("Network interrupted");
    await expect(
      billingOperation(database.DB, "user", { kind: "checkout", interval: "year" }),
    ).rejects.toThrow("still being prepared");
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("blocks duplicate subscriptions including past-due payment recovery", async () => {
    mocks.listSubscriptions.mockResolvedValue([
      { result: { items: [{ ...subscription, status: "past_due" }] } },
    ]);
    await expect(
      billingOperation(database.DB, "user", { kind: "checkout", interval: "month" }),
    ).rejects.toThrow("already have a subscription");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("schedules a plan change without an immediate charge and saves provider pending details", async () => {
    mocks.listSubscriptions.mockResolvedValue([{ result: { items: [subscription] } }]);
    mocks.updateSubscription.mockResolvedValue({
      ...subscription,
      pendingUpdate: { productId: "annual", appliesAt: subscription.currentPeriodEnd },
    });
    await billingOperation(database.DB, "user", { kind: "interval", interval: "year" });
    expect(mocks.updateSubscription).toHaveBeenCalledWith({
      id: "sub",
      subscriptionUpdate: { productId: "annual", prorationBehavior: "next_period" },
    });
    expect((await readBillingAccess(database.DB, "user")).pendingRenewal?.interval).toBe("year");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("durable payment evidence and event ordering", () => {
  it("grants tax-inclusive payments and revokes only a full refund of the net amount", async () => {
    await saveSubscription(database.DB, "user", subscription);
    const inclusive = { ...order, netAmount: 417, taxAmount: 83, totalAmount: 500 };
    await savePaidOrder(database.DB, inclusive, subscription);
    expect((await readBillingAccess(database.DB, "user")).state).toBe("paid");
    await savePaidOrder(database.DB, { ...inclusive, refundedAmount: 100 }, subscription);
    expect((await readBillingAccess(database.DB, "user")).state).toBe("paid");
    await savePaidOrder(database.DB, { ...inclusive, refundedAmount: 417 }, subscription);
    expect((await readBillingAccess(database.DB, "user")).state).toBe("revoked");
  });

  it("deduplicates paid orders, preserves partial refunds, and revokes full refunds", async () => {
    await saveSubscription(database.DB, "user", subscription);
    await savePaidOrder(database.DB, order, subscription);
    await savePaidOrder(database.DB, order, subscription);
    expect(await database.db.$count(billingPaidPeriod)).toBe(1);
    await savePaidOrder(
      database.DB,
      { ...order, refundedAmount: 100, modifiedAt: new Date(now + 1) },
      subscription,
    );
    expect((await readBillingAccess(database.DB, "user")).state).toBe("paid");
    await savePaidOrder(
      database.DB,
      { ...order, refundedAmount: 500, modifiedAt: new Date(now + 2) },
      subscription,
    );
    expect((await readBillingAccess(database.DB, "user")).state).toBe("revoked");
    await savePaidOrder(database.DB, order, subscription);
    expect((await readBillingAccess(database.DB, "user")).state).toBe("revoked");
  });
  it("stale subscription snapshots cannot undo revocation", async () => {
    await saveSubscription(database.DB, "user", subscription);
    await savePaidOrder(database.DB, order, subscription);
    await saveSubscription(database.DB, "user", {
      ...subscription,
      endedAt: new Date(now),
      status: "canceled",
      modifiedAt: new Date(now + 1),
    });
    await saveSubscription(database.DB, "user", subscription);
    expect((await readBillingAccess(database.DB, "user")).state).toBe("revoked");
  });
  it("keeps revocation and refunds terminal when timestamps round to the same millisecond", async () => {
    await saveSubscription(database.DB, "user", {
      ...subscription,
      endedAt: new Date(now),
      status: "canceled",
    });
    await saveSubscription(database.DB, "user", subscription);
    expect((await readBillingAccess(database.DB, "user")).state).toBe("revoked");
    await savePaidOrder(database.DB, { ...order, refundedAmount: 500 }, subscription);
    await savePaidOrder(database.DB, order, subscription);
    expect(
      (
        await database.db
          .select()
          .from(billingPaidPeriod)
          .where(eq(billingPaidPeriod.orderId, "order"))
          .get()
      )?.refunded,
    ).toBe(1);
  });

  it("unknown products and cross-account subscriptions cannot grant access", async () => {
    await saveSubscription(database.DB, "user", {
      ...subscription,
      customer: { ...subscription.customer, externalId: "other" },
    });
    await saveSubscription(database.DB, "user", { ...subscription, productId: "unknown" });
    expect(await database.db.$count(billingSubscription)).toBe(0);
    await savePaidOrder(database.DB, { ...order, productId: "unknown" }, subscription);
    expect(await database.db.$count(billingPaidPeriod)).toBe(0);
  });
});
