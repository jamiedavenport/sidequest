import { and, eq } from "drizzle-orm";
import { Effect, Result, Schema } from "effect";
import { createDatabase } from "~/db/database";
import { githubConnection } from "~/db/schema/github";
import { env } from "~/env";
import { serverRuntime } from "~/server/runtime";
import { fromGithubPromise, GitHubError, GitHubId } from "./schema";

const Payload = Schema.Struct({
  installation: Schema.optionalKey(Schema.Struct({ id: GitHubId })),
  repository: Schema.optionalKey(Schema.Struct({ id: GitHubId })),
  issue: Schema.optionalKey(Schema.Struct({ number: GitHubId })),
  action: Schema.optionalKey(Schema.String),
});

const verifyGithubSignature = Effect.fn("verifyGithubSignature")(function* (
  body: ArrayBuffer,
  signature: string,
  secret: string,
) {
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) {
    return false;
  }
  const key = yield* fromGithubPromise(() =>
    crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    ),
  );
  const bytes = Uint8Array.from(signature.slice(7).match(/../g) ?? [], (byte) =>
    parseInt(byte, 16),
  );
  return yield* fromGithubPromise(() => crypto.subtle.verify("HMAC", key, bytes, body));
});

const importWebhookIssues = Effect.fn("importWebhookIssues")(function* (
  bindings: Env,
  installationId: number,
  repositoryId?: number,
  issueNumber?: number,
): Effect.fn.Return<void, GitHubError> {
  const connections = yield* fromGithubPromise(() =>
    createDatabase(bindings.DB)
      .select()
      .from(githubConnection)
      .where(
        and(
          eq(githubConnection.installationId, installationId),
          repositoryId === undefined ? undefined : eq(githubConnection.repositoryId, repositoryId),
        ),
      ),
  );
  const results = yield* Effect.forEach(
    connections,
    (connection) =>
      fromGithubPromise(() =>
        bindings.BOARD.getByName(connection.userId).importGithubIssues(
          connection.userId,
          connection.id,
          issueNumber,
        ),
      ).pipe(Effect.result),
    { concurrency: "unbounded" },
  );
  if (results.some(Result.isFailure)) {
    return yield* new GitHubError({ message: "GitHub import failed." });
  }
  return undefined;
});

const processGithubWebhook = Effect.fn("processGithubWebhook")(function* (
  request: Request,
  bindings: Env,
) {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    return new Response("GitHub webhook is not configured", { status: 503 });
  }
  const body = yield* fromGithubPromise(() => request.arrayBuffer());
  const valid = yield* verifyGithubSignature(
    body,
    request.headers.get("x-hub-signature-256") ?? "",
    env.GITHUB_WEBHOOK_SECRET,
  );
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }
  const event = request.headers.get("x-github-event");
  if (!["issues", "installation", "installation_repositories"].includes(event ?? "")) {
    return new Response(null, { status: 204 });
  }
  const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Payload))(
    new TextDecoder().decode(body),
  ).pipe(Effect.result);
  if (Result.isFailure(decoded)) {
    return new Response("Invalid payload", { status: 400 });
  }
  const payload = decoded.success;
  if (!payload.installation || (event === "issues" && (!payload.issue || !payload.repository))) {
    return new Response("Missing installation or issue identity", { status: 400 });
  }
  if (["deleted", "suspend", "removed"].includes(payload.action ?? "")) {
    return new Response(null, { status: 204 });
  }
  yield* importWebhookIssues(
    bindings,
    payload.installation.id,
    payload.repository?.id,
    event === "issues" ? payload.issue?.number : undefined,
  );
  return new Response(null, { status: 204 });
});

export function handleGithubWebhook(request: Request, bindings: Env): Promise<Response> {
  return serverRuntime.runPromise(
    processGithubWebhook(request, bindings).pipe(
      Effect.catch(() =>
        Effect.logWarning("github.webhook_failed", {
          delivery: request.headers.get("x-github-delivery"),
        }).pipe(
          Effect.as(new Response("GitHub import failed. Retry with Sync now.", { status: 502 })),
        ),
      ),
    ),
  );
}
