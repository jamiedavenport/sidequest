import { continueOAuth, getConsentRequest } from "~/auth/connections";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { codeSearchSchema } from "~/auth/schema";
import { Component } from "~/routes/code.tsrx";

export const Route = createFileRoute("/code")({
  beforeLoad: async ({ context, search }) => {
    if (search.oauthQuery) {
      await getConsentRequest({ data: { oauthQuery: search.oauthQuery } });
      if (context.session)
        throw redirect({ href: await continueOAuth({ data: { oauthQuery: search.oauthQuery } }) });
    }
    if (context.session !== null) {
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
  const { email, oauthQuery } = Route.useSearch();

  return <Component email={email ?? ""} oauthQuery={oauthQuery} />;
}
