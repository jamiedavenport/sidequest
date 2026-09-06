import { env } from "cloudflare:workers";
import { handleMcpRoutes } from "~/mcp/http";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export { BoardObject } from "~/board/sync/server";

export default createServerEntry({
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === "www.sdqst.app") {
      url.hostname = "sdqst.app";
      return Response.redirect(url.href, 301);
    }

    // Router search normalization collapses repeated signed OAuth parameters. Keep the raw query intact.
    if ((url.pathname === "/login" || url.pathname === "/consent") && url.searchParams.has("sig")) {
      const oauthQuery = url.search.slice(1);
      url.search = new URLSearchParams({ oauthQuery }).toString();
      return Response.redirect(url.href, 302);
    }

    const mcpResponse = await handleMcpRoutes(request, env);
    return mcpResponse ?? handler.fetch(request);
  },
});
