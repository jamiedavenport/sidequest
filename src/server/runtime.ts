import { type Effect, Layer, Logger, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { toGithubError } from "~/github/schema";
import { GitHubApi } from "~/github/api";

const ServerLayer = Layer.mergeAll(
  FetchHttpClient.layer,
  GitHubApi.layer.pipe(Layer.provide(FetchHttpClient.layer)),
  Logger.layer([Logger.consoleJson]),
);

export const serverRuntime = ManagedRuntime.make(ServerLayer);

// Only actionable messages cross RPC/server-function boundaries; request objects may contain credentials.
export function runGithub<A, E>(effect: Effect.Effect<A, E, GitHubApi>): Promise<A> {
  return serverRuntime.runPromise(effect).catch((error: unknown) => {
    // oxlint-disable-next-line eslint/preserve-caught-error -- Upstream causes can contain credentials.
    throw new Error(toGithubError(error).message);
  });
}
