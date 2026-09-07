import { createFileRoute } from "@tanstack/react-router";
import { env as bindings } from "cloudflare:workers";

import { handleGithubWebhook } from "~/github/webhook";

export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handleGithubWebhook(request, bindings),
      ANY: () => new Response("Method not allowed", { status: 405 }),
    },
  },
});
