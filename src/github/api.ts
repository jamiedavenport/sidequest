import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { GitHubError } from "./schema";

export class GitHubApi extends Context.Service<
  GitHubApi,
  {
    request<T>(
      token: string,
      path: string,
      schema: Schema.Decoder<T>,
      body?: object,
    ): Effect.Effect<T, GitHubError>;
  }
>()("sidequest/github/GitHubApi") {
  static readonly layer = Layer.effect(
    GitHubApi,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const request = Effect.fn("GitHubApi.request")(function* <T>(
        token: string,
        path: string,
        schema: Schema.Decoder<T>,
        body?: object,
      ) {
        yield* Effect.annotateCurrentSpan({
          component: "github",
          category: "integration",
          provider: "github",
        });
        let httpRequest = HttpClientRequest.make(body ? "PATCH" : "GET")(
          `https://api.github.com${path}`,
        ).pipe(
          HttpClientRequest.setHeaders({
            authorization: `Bearer ${token}`,
            accept: "application/vnd.github+json",
            "user-agent": "Sidequest",
            "x-github-api-version": "2022-11-28",
          }),
        );
        if (body) {
          httpRequest = httpRequest.pipe(HttpClientRequest.bodyJsonUnsafe(body));
        }
        const response = yield* client.execute(httpRequest).pipe(
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.timeout("30 seconds"),
          Effect.mapError(
            () =>
              new GitHubError({
                message: "GitHub could not be reached. Try Sync now again.",
              }),
          ),
        );
        yield* Effect.annotateCurrentSpan({
          status: response.status,
          upstreamRequestId: response.headers["x-github-request-id"],
          rateLimitRemaining: Number(response.headers["x-ratelimit-remaining"]),
        });
        if (response.status < 200 || response.status >= 300) {
          return yield* getGithubResponseError(response.status, response.headers);
        }
        return yield* response.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(schema)),
          Effect.mapError(
            () =>
              new GitHubError({
                message: "GitHub returned an unexpected response. Try Sync now later.",
              }),
          ),
        );
      });
      return GitHubApi.of({ request });
    }),
  );
}

function getGithubResponseError(status: number, headers: Readonly<Record<string, string>>) {
  const rateLimited =
    status === 429 ||
    (status === 403 &&
      (headers["x-ratelimit-remaining"] === "0" || headers["retry-after"] !== undefined));
  if (rateLimited) {
    return new GitHubError({ message: "GitHub rate limit reached. Try Sync now later." });
  }
  if ([401, 403, 404, 422].includes(status)) {
    return new GitHubError({
      message:
        "Reconnect GitHub or manage repository access, then use Sync now. Issues write permission is required.",
    });
  }
  return new GitHubError({ message: "GitHub is temporarily unavailable. Try Sync now later." });
}
