import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";

/** Optional smoke check against an independently packaged MCP client, with isolated local settings. */
export async function inspectTools(url: string, token: string): Promise<number> {
  const directory = await mkdtemp(join(tmpdir(), "sidequest-inspector-"));
  try {
    const configPath = join(directory, "mcp.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          sidequest: { type: "http", url, headers: { Authorization: `Bearer ${token}` } },
        },
      }),
      { mode: 0o600 },
    );
    const child = spawn(
      "bunx",
      [
        "@modelcontextprotocol/inspector@2.5.0",
        "--cli",
        "--config",
        configPath,
        "--server",
        "sidequest",
        "--method",
        "tools/list",
        "--format",
        "json",
        "--stored-auth-only",
        "--client-config",
        join(directory, "client.json"),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    // Redact credentials from third-party diagnostics before reporting a failure.
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    if (code !== 0)
      throw new Error(
        `MCP Inspector exited with status ${code}: ${(stderr + stdout).replaceAll(token, "[redacted]").slice(0, 2000)}`,
      );
    const result = Schema.decodeUnknownSync(
      Schema.Struct({ result: Schema.Struct({ tools: Schema.Array(Schema.Unknown) }) }),
    )(JSON.parse(stdout));
    return result.result.tools.length;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
