import { type Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { withInvocationContext } from "~/telemetry/runtime";
import { toGithubError } from "~/github/schema";
import { GitHubApi } from "~/github/api";

const ServerLayer = Layer.mergeAll(
  FetchHttpClient.layer,
  GitHubApi.layer.pipe(Layer.provide(FetchHttpClient.layer)),
);

const runtime = ManagedRuntime.make(ServerLayer);

export const serverRuntime = {
  runPromise<A, E>(effect: Effect.Effect<A, E, GitHubApi | HttpClient.HttpClient>) {
    return runtime.runPromise(withInvocationContext(effect));
  },
};

// Only actionable messages cross RPC/server-function boundaries; request objects may contain credentials.
export function runGithub<A, E>(
  effect: Effect.Effect<A, E, GitHubApi | HttpClient.HttpClient>,
): Promise<A> {
  return serverRuntime.runPromise(effect).catch((error: unknown) => {
    // oxlint-disable-next-line eslint/preserve-caught-error -- Upstream causes can contain credentials.
    throw new Error(toGithubError(error).message);
  });
}
