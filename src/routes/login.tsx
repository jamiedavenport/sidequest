import { createFileRoute, redirect } from "@tanstack/react-router";

import { Component } from "~/routes/login.tsrx";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.user !== null) {
      throw redirect({ to: "/" });
    }
  },
  component: Component,
});
