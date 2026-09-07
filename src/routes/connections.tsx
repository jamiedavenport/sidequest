import { createFileRoute, redirect } from "@tanstack/react-router";
import { listConnections } from "~/auth/connections";
import { Component } from "~/routes/connections.tsrx";

export const Route = createFileRoute("/connections")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
  loader: () => listConnections(),
  component: ConnectionsRoute,
});

function ConnectionsRoute() {
  return <Component connections={Route.useLoaderData()} />;
}
