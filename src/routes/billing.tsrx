import { getRouteApi } from "@tanstack/react-router";
import { useHydrated } from "~/auth/use-hydrated";
// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useEffect, useState } from "react";
import { AuthShell } from "~/auth/components/auth-shell.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import { type BillingInterval } from "~/billing/access";
import {
  createBillingCheckout,
  createBillingPortal,
  scheduleBillingInterval,
  refreshBillingStatus,
} from "~/billing/functions";

function date(value: number | null) {
  return value === null ? "pending confirmation" : new Date(value).toLocaleDateString();
}

async function subscribe(interval: BillingInterval) {
  const result = await createBillingCheckout({ data: { interval } });
  if (result.url) {
    window.location.assign(result.url);
  }
}

async function portal() {
  const result = await createBillingPortal();
  if (result.url) {
    window.location.assign(result.url);
  }
}

const routeApi = getRouteApi("/billing");

export function Component() @{
  const initial = routeApi.useLoaderData();
  const hydrated = useHydrated();
  const [access, setAccess] = useState(initial);
  const hasPaidSubscription = access.state === "paid" || access.state === "grace";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const waiting = new URLSearchParams(window.location.search).has("confirming");
    if (!waiting) {
      return;
    }
    setConfirming(true);
    let active = true;
    let attempts = 0;
    const poll = async () => {
      try {
        const next = await refreshBillingStatus();
        if (!active) {
          return;
        }
        setAccess(next);
        if (next.state === "paid") {
          setConfirming(false);
          clearInterval(timer);
        }
      } catch {
        /* The webhook may still be in flight. Keep the confirmation state. */
      }
      if (++attempts >= 12) {
        clearInterval(timer);
      }
    };
    const timer = setInterval(() => {
      void poll();
    }, 5000);
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Billing could not be updated. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(interval: BillingInterval) {
    setAccess(await scheduleBillingInterval({ data: { interval } }));
  }
  async function refresh() {
    const next = await refreshBillingStatus();
    setAccess(next);
    if (next.state === "paid") {
      setConfirming(false);
    }
  }

  <AuthShell title="Your subscription" description={<>All Sidequest features, on either plan.</>}>
    <div className="flex flex-col gap-5">
      <output aria-live="polite">
        {confirming
          ? "Confirming payment… Access updates after payment is verified."
          : access.state === "trial"
            ? `Your free trial ends ${date(access.trialExpiresAt)}.`
            : access.state === "paid"
              ? `Paid through ${date(access.paidThrough)}.`
              : access.state === "grace"
                ? `Please update payment before ${date(access.graceExpiresAt)} to keep editing.`
                : !access.enforcement
                  ? "Your free trial has ended. You can still edit your board for now."
                  : "Subscribe or update payment to return to your board. Your data and pending edits are preserved."}
      </output>
      @if (access.cancelAtPeriodEnd && access.paidThrough) {
        <p>Cancellation scheduled. Access continues until {date(access.paidThrough)}.</p>;
      }
      @if (access.pendingRenewal) {
        <p>
          Switching to {access.pendingRenewal.interval === "month" ? "$5/month" : "$50/year"}{" "}
          on {date(access.pendingRenewal.appliesAt)}.
        </p>;
      }
      <p>
        $5/month or $50/year USD. Tax is included or added based on your location. Polar shows the
        final total before purchase. Payment starts immediately.
      </p>
      @if (!access.checkoutEnabled) {
        <p>Subscriptions are not available yet.</p>;
      }
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            !hydrated || busy || !access.checkoutEnabled || confirming || hasPaidSubscription
          }
          onClick={() => {
            void run(() => subscribe("month"));
          }}
        >
          Subscribe monthly — $5
        </Button>
        <Button
          disabled={
            !hydrated || busy || !access.checkoutEnabled || confirming || hasPaidSubscription
          }
          onClick={() => {
            void run(() => subscribe("year"));
          }}
        >
          Subscribe annually — $50
        </Button>
      </div>
      <Button
        variant="outline"
        disabled={!hydrated || busy}
        onClick={() => {
          void run(portal);
        }}
      >
        Manage billing, invoices and cancellation
      </Button>
      @if (
        access.subscriptionId &&
        access.state === "paid" &&
        !access.cancelAtPeriodEnd
      ) {
        <>
          <Button
            variant="outline"
            disabled={!hydrated || busy || !access.checkoutEnabled}
            onClick={() => {
              void run(() => change(access.interval === "month" ? "year" : "month"));
            }}
          >
            Switch to {access.interval === "month" ? "$50/year" : "$5/month"} at next renewal
          </Button>
          <p className="text-sm text-muted-foreground">
            Plan changes start at renewal, with no immediate charge or proration.
          </p>
        </>;
      }
      <Button
        variant="outline"
        disabled={!hydrated || busy}
        onClick={() => {
          void run(refresh);
        }}
      >
        Refresh payment status
      </Button>
      @if (error) {
        <p role="alert" className="text-destructive">
          {error}
        </p>;
      }
      <a href="/" className="underline">
        Back to your board
      </a>
    </div>
  </AuthShell>;
}
