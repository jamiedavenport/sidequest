import { describe, expect, it, vi } from "vitest";
import { canWrite, DAY, deriveAccess, type SubscriptionAccess } from "~/billing/access";
import { paidOrderPeriod } from "~/billing/provider";

vi.mock("~/env", () => ({ env: {} }));

const createdAt = Date.UTC(2026, 0, 1);

const paidThrough = createdAt + 31 * DAY;

const subscription: SubscriptionAccess = {
  id: "sub",
  interval: "month",
  paidThrough,
  cancelAtPeriodEnd: false,
  revoked: false,
  pendingRenewal: null,
};

function access(now: number, subscriptions: SubscriptionAccess[] = [], enforcement = true) {
  return deriveAccess({
    userId: "user",
    createdAt,
    subscriptions,
    now,
    enforcement,
    checkoutEnabled: true,
  });
}

describe("billing access boundaries", () => {
  it("expires the card-free trial exactly 14 days after account creation", () => {
    expect(access(createdAt + 14 * DAY - 1).state).toBe("trial");
    const expired = access(createdAt + 14 * DAY);
    expect(expired.state).toBe("expired");
    expect(canWrite(expired, createdAt + 14 * DAY)).toBe(false);
    expect(access(createdAt + 365 * DAY).trialExpiresAt).toBe(createdAt + 14 * DAY);
  });
  it("charges immediately and uses confirmed paid-through periods", () => {
    expect(access(createdAt + DAY, [subscription]).state).toBe("paid");
    expect(access(createdAt + 15 * DAY, [{ ...subscription, paidThrough: null }]).state).toBe(
      "expired",
    );
  });
  it("allows exactly 72 hours after an unconfirmed renewal", () => {
    expect(access(paidThrough - 1, [subscription]).state).toBe("paid");
    expect(access(paidThrough, [subscription]).state).toBe("grace");
    expect(access(paidThrough + 3 * DAY - 1, [subscription]).state).toBe("grace");
    expect(access(paidThrough + 3 * DAY, [subscription]).state).toBe("expired");
  });
  it("does not give cancellation a grace period", () => {
    const canceled = { ...subscription, cancelAtPeriodEnd: true };
    expect(access(paidThrough - 1, [canceled]).state).toBe("paid");
    expect(access(paidThrough, [canceled]).state).toBe("expired");
    expect(access(paidThrough, [canceled]).graceExpiresAt).toBeNull();
  });
  it("revocation overrides paid access, grace and an unfinished trial", () => {
    for (const now of [createdAt + DAY, paidThrough + DAY]) {
      const revoked = access(now, [{ ...subscription, revoked: true }]);
      expect(revoked.state).toBe("revoked");
      expect(canWrite(revoked, now)).toBe(false);
    }
  });
  it("restores access with a new confirmed subscription and reports the provider's pending plan", () => {
    const next = {
      ...subscription,
      id: "new",
      interval: "year" as const,
      paidThrough: createdAt + 366 * DAY,
      pendingRenewal: { interval: "month" as const, appliesAt: createdAt + 366 * DAY },
    };
    const result = access(paidThrough + 4 * DAY, [{ ...subscription, revoked: true }, next]);
    expect(result.state).toBe("paid");
    expect(result.subscriptionId).toBe("new");
    expect(result.pendingRenewal).toEqual(next.pendingRenewal);
  });
  it("keeps the rollback switch independent of calculated expiry", () => {
    const result = access(createdAt + 365 * DAY, [], false);
    expect(result.state).toBe("expired");
    expect(canWrite(result, createdAt + 365 * DAY)).toBe(true);
  });
  it("rechecks the deadline when enforcing previously calculated access", () => {
    const previous = access(paidThrough - DAY, [subscription]);
    expect(canWrite(previous, paidThrough + 3 * DAY)).toBe(false);
  });
});

describe("paid order evidence", () => {
  const period = {
    id: "sub",
    customerId: "customer",
    currentPeriodStart: new Date(createdAt),
    currentPeriodEnd: new Date(paidThrough),
  };
  const order = {
    paid: true,
    billingReason: "subscription_create" as const,
    subscriptionId: "sub",
    customerId: "customer",
    currency: "usd",
    netAmount: 500,
    discountAmount: 0,
    createdAt: new Date(createdAt + 100),
  };
  it("accepts an actual paid order for its subscription period", () => {
    expect(paidOrderPeriod(order, period)).toEqual({ start: createdAt, end: paidThrough });
  });
  it("never uses an old paid order to prove a newer renewal", () => {
    expect(
      paidOrderPeriod(order, {
        ...period,
        currentPeriodStart: new Date(paidThrough),
        currentPeriodEnd: new Date(paidThrough + 31 * DAY),
      }),
    ).toBeNull();
  });
  it.each([
    { paid: false },
    { customerId: "other" },
    { subscriptionId: "other" },
    { currency: "eur" },
    { netAmount: 0 },
    { discountAmount: 500 },
    { billingReason: "subscription_update" as const },
    { createdAt: new Date(paidThrough) },
  ])("rejects unproven or mismatched payment: %o", (patch) => {
    expect(paidOrderPeriod({ ...order, ...patch }, period)).toBeNull();
  });
});
