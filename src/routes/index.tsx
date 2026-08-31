import { createFileRoute, redirect } from "@tanstack/react-router";

import { Component } from "~/routes/index.tsrx";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.session === null) {
      throw redirect({ to: "/login" });
    }
  },
  loader: ({ context }) => {
    if (context.session === null) {
      throw redirect({ to: "/login" });
    }

    return context.session;
  },
  component: Component,
});
