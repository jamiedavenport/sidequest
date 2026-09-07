import { continueOAuth, getConsentRequest } from "~/auth/connections";
import { oauthQueryFromSearch } from "~/auth/oauth-continuation";
import { loginSearchSchema } from "~/auth/schema";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { Component } from "~/routes/login.tsrx";

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ context, location }) => {
    const oauthQuery = oauthQueryFromSearch(location.searchStr);
    if (oauthQuery) {
      await getConsentRequest({ data: { oauthQuery } });
      if (context.session) {
        throw redirect({ href: await continueOAuth({ data: { oauthQuery } }) });
      }
    }
    if (context.session !== null) {
      throw redirect({ to: "/" });
    }
  },
  component: Component,
});
