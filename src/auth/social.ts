import { createServerFn } from "@tanstack/react-start";
import { env } from "~/env";

export const getSocialProviders = createServerFn({ method: "GET" }).handler(() => ({
  github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
}));
