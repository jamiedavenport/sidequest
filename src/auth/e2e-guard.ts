const localHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

export function isE2EEnabled(
  config: { E2E_MODE?: string; E2E_SESSION_SECRET?: string; BETTER_AUTH_URL: URL },
  requestUrl: string,
  secret: string | null,
): boolean {
  return (
    config.E2E_MODE === "1" &&
    config.E2E_SESSION_SECRET !== undefined &&
    secret === config.E2E_SESSION_SECRET &&
    localHosts.has(config.BETTER_AUTH_URL.hostname) &&
    localHosts.has(new URL(requestUrl).hostname)
  );
}
