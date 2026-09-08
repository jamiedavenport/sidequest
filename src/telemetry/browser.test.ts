import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("discards queued performance records on consent withdrawal while preserving necessary errors", async () => {
  vi.resetModules();
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: true, userAgent: "test" });
  const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  const { setTelemetryConsent, reportBrowserEvent, flushBrowserEvents } = await import("./browser");
  setTelemetryConsent(true);
  reportBrowserEvent("web_vital", { metric: "LCP", value: 1 });
  reportBrowserEvent("global_error", {
    fingerprint: "test",
    sessionId: "SECRET",
    content: "SECRET",
  });
  setTelemetryConsent(false);
  await flushBrowserEvents();
  const request = JSON.stringify(fetcher.mock.calls);
  expect(request).toContain("global_error");
  expect(request).not.toContain("web_vital");
  expect(request).not.toContain("SECRET");
});
