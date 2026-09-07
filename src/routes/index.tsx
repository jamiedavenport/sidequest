import { createFileRoute, redirect } from "@tanstack/react-router";

import { Component } from "~/routes/index.tsrx";
import { requireBoardAccess } from "~/billing/functions";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (context.session === null) {
      throw redirect({ to: "/login" });
    }
    await requireBoardAccess();
  },
  loader: ({ context }) => {
    if (context.session === null) {
      throw redirect({ to: "/login" });
    }

    return context.session;
  },
  component: Component,
});
