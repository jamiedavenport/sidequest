import { createFileRoute } from "@tanstack/react-router";
import { handleMediaRequest } from "~/board/attachments/http/handler";

export const Route = createFileRoute("/api/attachments/$id")({
  server: {
    handlers: {
      PUT: ({ request, params }) => handleMediaRequest(request, params.id),
      GET: ({ request, params }) => handleMediaRequest(request, params.id),
      HEAD: ({ request, params }) => handleMediaRequest(request, params.id),
    },
  },
});
