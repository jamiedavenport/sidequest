import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { auth } from "~/auth/server";
import { handleBoardRequest } from "~/board/sync/server";

export const Route = createFileRoute("/api/board")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const upgrade = request.headers.get("Upgrade");
        if (upgrade?.toLowerCase() !== "websocket") {
          return new Response("Expected Upgrade: websocket", { status: 426 });
        }

        const session = await auth.api.getSession({ headers: request.headers });
        if (session === null) {
          return new Response("Unauthorized", { status: 401 });
        }

        return handleBoardRequest(request, env, session.user.id);
      },
    },
  },
});
