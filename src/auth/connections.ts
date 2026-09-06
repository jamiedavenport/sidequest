import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { Schema } from "effect";
import { createAuth } from "~/auth/server";
import { env } from "~/env";
import { db } from "~/db/client";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "~/db/schema";

function oauthRequestHeaders(): Headers {
  const headers = new Headers(getRequestHeaders());
  headers.set("accept", "application/json");
  return headers;
}

async function oauthRedirect(path: "consent" | "continue", body: object): Promise<string> {
  const headers = oauthRequestHeaders();
  headers.set("content-type", "application/json");
  headers.set("origin", env.BETTER_AUTH_URL.origin);
  // Authorize's nested dispatch requires a Request, including for server-side continuation calls.
  const response = await createAuth().handler(
    new Request(new URL(`/api/auth/oauth2/${path}`, env.BETTER_AUTH_URL), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok)
    throw new Error("Authorization could not be completed. Reconnect from your MCP client.");
  return Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(await response.json()).url;
}

const Query = Schema.toStandardSchemaV1(
  Schema.Struct({ oauthQuery: Schema.String.check(Schema.isMaxLength(16000)) }),
);

export const getConsentRequest = createServerFn({ method: "POST" })
  .validator(Query)
  .handler(async ({ data }) => {
    const params = new URLSearchParams(data.oauthQuery);
    // This provider endpoint verifies the signature and expiry server-side before returning metadata.
    const client = await createAuth().api.getOAuthClientPublicPrelogin({
      headers: oauthRequestHeaders(),
      body: { client_id: params.get("client_id") ?? "", oauth_query: data.oauthQuery },
    });
    return {
      name: client.client_name ?? "Unnamed application",
      clientId: client.client_id,
      scopes: (params.get("scope") ?? "").split(" "),
    };
  });

export const continueOAuth = createServerFn({ method: "POST" })
  .validator(Query)
  .handler(async ({ data }) => {
    return oauthRedirect("continue", { oauth_query: data.oauthQuery, postLogin: true });
  });

export const decideConsent = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ oauthQuery: Schema.String, accept: Schema.Boolean, write: Schema.Boolean }),
    ),
  )
  .handler(async ({ data }) => {
    const requested = new URLSearchParams(data.oauthQuery).get("scope")?.split(" ") ?? [];
    const scope = requested
      .filter(
        (s) =>
          s === "sidequest:read" ||
          s === "offline_access" ||
          (s === "sidequest:write" && data.write),
      )
      .join(" ");
    return oauthRedirect("consent", { oauth_query: data.oauthQuery, accept: data.accept, scope });
  });

export const listConnections = createServerFn({ method: "GET" }).handler(async () => {
  const session = await createAuth().api.getSession({ headers: getRequestHeaders() });
  if (!session) throw new Error("Sign in to manage connected apps.");
  const rows = await db
    .select({
      clientId: oauthConsent.clientId,
      name: oauthClient.name,
      scopes: oauthConsent.scopes,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthConsent.clientId, oauthClient.clientId))
    .where(eq(oauthConsent.userId, session.user.id));
  return rows.map((row) => ({
    ...row,
    scopes: Schema.decodeUnknownSync(Schema.Array(Schema.String))(JSON.parse(row.scopes)),
  }));
});

export const revokeConnection = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ clientId: Schema.String })))
  .handler(async ({ data }) => {
    const session = await createAuth().api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error("Sign in to manage connected apps.");
    const userId = session.user.id;
    // D1 batch is transactional: access, refresh, and consent are revoked together.
    await db.batch([
      db
        .delete(oauthAccessToken)
        .where(
          and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, data.clientId)),
        ),
      db
        .delete(oauthRefreshToken)
        .where(
          and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, data.clientId)),
        ),
      db
        .delete(oauthConsent)
        .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, data.clientId))),
    ]);
    return { revoked: true };
  });
