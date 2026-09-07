import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createAuth } from "~/auth/server";
import { handleBoardRequest } from "~/board/sync/server";

export const Route = createFileRoute("/api/board")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const upgrade = request.headers.get("Upgrade");
        if (upgrade?.toLowerCase() !== "websocket") {
          return new Response("Expected Upgrade: websocket", { status: 426 });
        }

        const url = new URL(request.url);
        if (url.searchParams.get("syncVersion") !== "2") {
          return new Response("Reload to update board sync", { status: 400 });
        }

        const session = await createAuth().api.getSession({ headers: request.headers });
        if (session === null) {
          return new Response("Unauthorized", { status: 401 });
        }

        if (url.searchParams.get("userId") !== session.user.id) {
          return new Response("Board account mismatch", { status: 403 });
        }

        const headers = new Headers(request.headers);
        headers.set("x-sidequest-user-id", session.user.id);
        headers.set("x-sidequest-session-id", session.session.id);
        const response = await handleBoardRequest(
          new Request(request, { headers }),
          env,
          session.user.id,
        );
        // Better Auth may refresh the session cookie during this upgrade.
        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
          webSocket: response.webSocket,
        });
      },
    },
  },
});
