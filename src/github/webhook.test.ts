import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "~/db/test-database";
import { githubConnection, user } from "~/db/schema";
import { handleGithubWebhook } from "./webhook";

vi.mock("~/env", () => ({ env: { GITHUB_WEBHOOK_SECRET: "test-webhook-secret" } }));

const cleanups: Array<() => void> = [];

afterEach(() => cleanups.splice(0).forEach((close) => close()));

function request(event: string, payload: object) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", "test-webhook-secret").update(body).digest("hex");
  return new Request("https://example.com/api/github/webhook", {
    method: "POST",
    headers: {
      "x-github-event": event,
      "x-github-delivery": "delivery",
      "x-hub-signature-256": `sha256=${signature}`,
    },
    body,
  });
}

async function fixture() {
  const database = createTestDatabase();
  cleanups.push(database.close);
  await database.db.insert(user).values({ id: "user", name: "User", email: "user@example.com" });
  await database.db.insert(githubConnection).values({
    id: "connection",
    userId: "user",
    laneId: "lane",
    installationId: 1,
    repositoryId: 2,
    repository: "owner/repo",
    labels: [],
  });
  const importGithubIssues = vi.fn(
    async (_userId: string, _connectionId: string, _issueNumber?: number) => {},
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Only this RPC is used by the webhook.
  const bindings = {
    DB: database.DB,
    BOARD: { getByName: () => ({ importGithubIssues }) },
  } as unknown as Env;
  return { bindings, importGithubIssues };
}

describe("GitHub direct webhook regressions", () => {
  it.each([
    { event: "installation", payload: { installation: { id: 1 } }, issueNumber: undefined },
    {
      event: "installation_repositories",
      payload: { installation: { id: 1 }, repositories_added: [{ id: 2 }] },
      issueNumber: undefined,
    },
    {
      event: "issues",
      payload: { installation: { id: 1 }, repository: { id: 2 }, issue: { number: 3 } },
      issueNumber: 3,
    },
  ])("imports directly for $event", async ({ event, payload, issueNumber }) => {
    const f = await fixture();
    const response = await handleGithubWebhook(request(event, payload), f.bindings);
    expect(response.status).toBe(204);
    expect(f.importGithubIssues).toHaveBeenCalledExactlyOnceWith("user", "connection", issueNumber);
  });

  it("waits for the import and reports a failed import instead of acknowledging it", async () => {
    const f = await fixture();
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<void>();
    f.importGithubIssues.mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });
    let responded = false;
    const handling = handleGithubWebhook(
      request("installation", { installation: { id: 1 } }),
      f.bindings,
    ).then((response) => {
      responded = true;
      return response;
    });
    await started.promise;
    expect(responded).toBe(false);
    pending.reject(new Error("Unavailable"));
    expect((await handling).status).toBe(502);
  });

  it("rejects invalid signatures and does not import unrelated installations", async () => {
    const f = await fixture();
    const invalid = request("installation", { installation: { id: 1 } });
    invalid.headers.set("x-hub-signature-256", `sha256=${"0".repeat(64)}`);
    expect((await handleGithubWebhook(invalid, f.bindings)).status).toBe(401);
    expect(
      (await handleGithubWebhook(request("installation", { installation: { id: 99 } }), f.bindings))
        .status,
    ).toBe(204);
    expect(f.importGithubIssues).not.toHaveBeenCalled();
  });
});
