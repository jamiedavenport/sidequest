import { createFileRoute, redirect } from "@tanstack/react-router";
import { getConsentRequest } from "~/auth/connections";
import { oauthQueryFromSearch } from "~/auth/oauth-continuation";
import { Component } from "~/routes/consent.tsrx";

export const Route = createFileRoute("/consent")({
  beforeLoad: async ({ context, location }) => {
    const oauthQuery = oauthQueryFromSearch(location.searchStr);
    if (!oauthQuery)
      throw new Error("Missing authorization request. Reconnect from your MCP client.");
    const consent = await getConsentRequest({ data: { oauthQuery } });
    if (!context.session) throw redirect({ to: "/login", search: { oauthQuery } });
    return { consent, oauthQuery };
  },
  loader: ({ context }) => ({ consent: context.consent, oauthQuery: context.oauthQuery }),
  component: ConsentRoute,
});

function ConsentRoute() {
  return <Component {...Route.useLoaderData()} />;
}
