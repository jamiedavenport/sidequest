import { createFileRoute, redirect } from "@tanstack/react-router";

import { Component } from "~/routes/index.tsrx";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.user === null) {
      throw redirect({ to: "/login" });
    }

    return { user: context.user };
  },
  component: IndexRoute,
});

function IndexRoute() {
  const { user } = Route.useRouteContext();

  return <Component userId={user.id} />;
}
