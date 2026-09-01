import { createFileRoute } from "@tanstack/react-router";

import { createE2ESession, deleteE2EUser } from "~/auth/e2e";

export const Route = createFileRoute("/api/e2e/session")({
  server: {
    handlers: {
      DELETE: ({ request }) => deleteE2EUser(request),
      POST: ({ request }) => createE2ESession(request),
    },
  },
});
