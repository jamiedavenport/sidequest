export const DAY = 86_400_000;

export type BillingInterval = "month" | "year";

export type BillingAccess = {
  readonly userId: string;
  readonly state: "trial" | "paid" | "grace" | "expired" | "revoked";
  readonly trialExpiresAt: number;
  readonly paidThrough: number | null;
  readonly graceExpiresAt: number | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly pendingRenewal: {
    readonly interval: BillingInterval;
    readonly appliesAt: number;
  } | null;
  readonly interval: BillingInterval | null;
  readonly subscriptionId: string | null;
  readonly writableUntil: number;
  readonly enforcement: boolean;
  readonly checkoutEnabled: boolean;
};

export type SubscriptionAccess = {
  id: string;
  interval: BillingInterval;
  paidThrough: number | null;
  cancelAtPeriodEnd: boolean;
  revoked: boolean;
  pendingRenewal: BillingAccess["pendingRenewal"];
};

export function deriveAccess(input: {
  userId: string;
  createdAt: number;
  subscriptions: readonly SubscriptionAccess[];
  enforcement: boolean;
  checkoutEnabled: boolean;
  now: number;
}): BillingAccess {
  const trialExpiresAt = input.createdAt + 14 * DAY;
  const candidates = input.subscriptions
    .map((s) => ({
      ...s,
      deadline: s.revoked
        ? 0
        : (s.paidThrough ?? 0) + (s.cancelAtPeriodEnd || !s.paidThrough ? 0 : 3 * DAY),
    }))
    .toSorted((a, b) => b.deadline - a.deadline || (b.paidThrough ?? 0) - (a.paidThrough ?? 0));
  const subscription = candidates[0];
  const paidThrough = subscription?.paidThrough ?? null;
  const graceExpiresAt =
    paidThrough !== null && !subscription?.cancelAtPeriodEnd && !subscription?.revoked
      ? paidThrough + 3 * DAY
      : null;
  const paid = !subscription?.revoked && paidThrough !== null && input.now < paidThrough;
  const grace = !paid && graceExpiresAt !== null && input.now < graceExpiresAt;
  const trial = input.now < trialExpiresAt && !subscription?.revoked;
  return {
    userId: input.userId,
    state: paid
      ? "paid"
      : grace
        ? "grace"
        : trial
          ? "trial"
          : subscription?.revoked
            ? "revoked"
            : "expired",
    trialExpiresAt,
    paidThrough,
    graceExpiresAt,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    pendingRenewal: subscription?.pendingRenewal ?? null,
    interval: subscription?.interval ?? null,
    subscriptionId: subscription?.id ?? null,
    writableUntil: subscription?.revoked
      ? 0
      : Math.max(trialExpiresAt, subscription?.deadline ?? 0),
    enforcement: input.enforcement,
    checkoutEnabled: input.checkoutEnabled,
  };
}

export function canWrite(access: BillingAccess, now = Date.now()) {
  return !access.enforcement || now < access.writableUntil;
}

export class BillingRequiredError extends Error {
  readonly code = "billing_required";
  constructor() {
    super("Subscribe or update payment at /billing to return to your board.");
  }
}
