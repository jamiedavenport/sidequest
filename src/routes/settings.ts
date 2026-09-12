import { createFileRoute, redirect } from "@tanstack/react-router";
import { Component } from "~/routes/settings.tsrx";

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
  loader: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
    return context.session;
  },
  component: Component,
});
