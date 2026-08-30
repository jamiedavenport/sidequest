import { createFileRoute, redirect } from "@tanstack/react-router";

import { codeSearchSchema } from "~/auth/schema";
import { Component } from "~/routes/code.tsrx";

export const Route = createFileRoute("/code")({
  beforeLoad: ({ context, search }) => {
    if (context.user !== null) {
      throw redirect({ to: "/" });
    }
    if (search.email === undefined || search.email.length === 0) {
      throw redirect({ to: "/login" });
    }
  },
  component: CodeRoute,
  validateSearch: codeSearchSchema,
});

function CodeRoute() {
  const { email } = Route.useSearch();

  return <Component email={email ?? ""} />;
}
