import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { handleBoardRequest } from "~/board/sync/server";

export const Route = createFileRoute("/api/board/$userId")({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        const upgrade = request.headers.get("Upgrade");
        if (upgrade?.toLowerCase() !== "websocket") {
          return new Response("Expected Upgrade: websocket", { status: 426 });
        }

        return handleBoardRequest(request, env, params.userId);
      },
    },
  },
});
