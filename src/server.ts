import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export { BoardObject } from "~/board/sync/server";

export default createServerEntry({
  fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === "www.sdqst.app") {
      url.hostname = "sdqst.app";
      return Response.redirect(url.href, 301);
    }

    return handler.fetch(request);
  },
});
