import { createFileRoute } from "@tanstack/react-router";
import { env as bindings } from "cloudflare:workers";

import { receiveBillingWebhook } from "~/billing/webhook";

export const Route = createFileRoute("/api/billing/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => receiveBillingWebhook(request, bindings),
      ANY: () => new Response("Method not allowed", { status: 405 }),
    },
  },
});
