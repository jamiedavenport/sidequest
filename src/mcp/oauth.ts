import { getOAuthProviderApi, type OAuthOptions } from "@better-auth/oauth-provider";
import { createAuthEndpoint } from "better-auth/api";

const mcpScopes = ["sidequest:read", "sidequest:write", "offline_access"];

export function oauthOptions(baseURL: string, enabled = true): OAuthOptions<string[]> {
  return {
    loginPage: "/login",
    consentPage: "/consent",
    disableJwtPlugin: true,
    scopes: mcpScopes,
    grantTypes: ["authorization_code", "refresh_token"],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationRequirePKCE: true,
    allowPublicClientPrelogin: true,
    clientRegistrationDefaultResources: enabled ? [new URL("/mcp", baseURL).href] : [],
    resources: enabled
      ? [{ identifier: new URL("/mcp", baseURL).href, name: "Sidequest", allowedScopes: mcpScopes }]
      : [],
    accessTokenExpiresIn: 3600,
    refreshTokenExpiresIn: 2592000,
  };
}

export function mcpTokenPlugin(options: OAuthOptions<string[]>) {
  return {
    id: "sidequest-mcp-token",
    endpoints: {
      validateMcpToken: createAuthEndpoint(
        "/mcp-token",
        { method: "GET", metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          const token = ctx.headers?.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1] ?? "";
          return getOAuthProviderApi(ctx, options).requireActiveAccessToken(token);
        },
      ),
    },
  } as const;
}
