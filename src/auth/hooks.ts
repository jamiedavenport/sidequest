import { getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/");

export function useSession() {
  return routeApi.useLoaderData();
}
