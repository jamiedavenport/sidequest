import { createRouter } from "@tanstack/react-router";

import { initializePageTracking } from "~/lib/openpanel";
import { routeTree } from "~/routeTree.gen";

export function getRouter() {
  initializePageTracking();

  return createRouter({
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
