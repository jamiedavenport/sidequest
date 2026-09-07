import { createFileRoute, redirect } from "@tanstack/react-router";
import { getBillingStatus } from "~/billing/functions";
import { Component } from "~/routes/billing.tsrx";

export const Route = createFileRoute("/billing")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
  loader: () => getBillingStatus(),
  component: Component,
});
