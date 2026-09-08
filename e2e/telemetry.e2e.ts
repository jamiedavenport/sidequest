import { expect, test } from "@playwright/test";

test("browser ingestion enforces origin, byte and record limits", async ({ request, baseURL }) => {
  const record = {
    event: "boot",
    time: Date.now(),
    reportingSession: "local-probe",
    details: { authorization: "NEVER_EXPORT", online: true },
  };
  const headers = {
    origin: baseURL!,
    "content-type": "application/json",
    "cf-connecting-ip": "192.0.2.17",
  };
  expect(
    (await request.post("/api/telemetry", { headers, data: { records: [record] } })).status(),
  ).toBe(204);
  expect(
    (
      await request.post("/api/telemetry", {
        headers: { ...headers, origin: "https://outside.invalid" },
        data: { records: [record] },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.post("/api/telemetry", { headers, data: " ".repeat(65537) })).status(),
  ).toBe(413);
  expect(
    (
      await request.post("/api/telemetry", {
        headers,
        data: { records: Array.from({ length: 51 }, () => record) },
      })
    ).status(),
  ).toBe(400);
});
