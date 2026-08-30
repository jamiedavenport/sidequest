import { createFileRoute } from "@tanstack/react-router";

import { codeSearchSchema } from "~/auth/schema";
import { Component } from "~/routes/code.tsrx";

export const Route = createFileRoute("/code")({
  component: CodeRoute,
  validateSearch: codeSearchSchema,
});

function CodeRoute() {
  const { email } = Route.useSearch();

  return <Component email={email} />;
}
