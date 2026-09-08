import { release } from "./release";
import {
  createTelemetryContext,
  parseTelemetryContext,
  sanitizeAttributes,
  type BrowserRecord,
  type TelemetryContext,
} from "./schema";

let queue: BrowserRecord[] = [];

let reportingSession: string | undefined;

let analyticsAllowed = false;

let active = false;

let sending = false;

let lastBatchAt = 0;

export function reportBrowserEvent(
  event: BrowserRecord["event"],
  details: Record<string, unknown> = {},
  telemetry?: TelemetryContext,
  link?: TelemetryContext,
) {
  if (typeof window === "undefined") {
    return;
  }
  if ((event === "web_vital" || event === "navigation") && !analyticsAllowed) {
    return;
  }
  reportingSession ??= crypto.randomUUID();
  const now = Date.now();
  queue = queue.filter((record) => now - record.time < 300_000).slice(-99);
  queue.push({
    event,
    time: now,
    reportingSession,
    ...(telemetry ? { telemetry } : {}),
    ...(link ? { link } : {}),
    details: sanitizeAttributes({
      ...details,
      clientRelease: release,
      online: navigator.onLine,
      browser: browserFamily(),
    }),
  });
  if (active && queue.length >= 20) {
    void flushBrowserEvents();
  }
}

function browserFamily() {
  const agent = navigator.userAgent;
  if (agent.includes("Firefox/")) {
    return "firefox";
  }
  if (agent.includes("Edg/")) {
    return "edge";
  }
  if (agent.includes("Chrome/")) {
    return "chrome";
  }
  if (agent.includes("Safari/")) {
    return "safari";
  }
  return "other";
}

export function setTelemetryConsent(allowed: boolean) {
  analyticsAllowed = allowed;
  if (!allowed) {
    queue = queue.filter((record) => record.event !== "web_vital" && record.event !== "navigation");
  }
}

export async function flushBrowserEvents(pageHide = false) {
  if (
    sending ||
    queue.length === 0 ||
    !navigator.onLine ||
    (!pageHide && Date.now() - lastBatchAt < 2100)
  ) {
    return;
  }
  sending = true;
  lastBatchAt = Date.now();
  const records = queue.splice(0, 20).filter((record) => Date.now() - record.time < 300_000);
  let body = JSON.stringify({ records });
  while (new TextEncoder().encode(body).byteLength > 65536 && records.length > 0) {
    const record = records.pop();
    if (record) {
      queue.unshift(record);
    }
    body = JSON.stringify({ records });
  }
  try {
    if (pageHide && navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
    } else {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        credentials: "same-origin",
        keepalive: true,
      });
    }
  } catch {
    /* Telemetry never joins the durable edit outbox. */
  } finally {
    sending = false;
  }
}

export function startBrowserTelemetry() {
  active = true;
  const onError = (event: ErrorEvent) =>
    reportBrowserEvent("global_error", { fingerprint: errorFingerprint(event.error) });
  const onRejection = (event: PromiseRejectionEvent) =>
    reportBrowserEvent("unhandled_rejection", { fingerprint: errorFingerprint(event.reason) });
  const onHide = () => {
    void flushBrowserEvents(true);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", onHide);
  const timer = setInterval(() => {
    void flushBrowserEvents();
  }, 5000);
  reportBrowserEvent(
    "boot",
    { persistentStorage: !!navigator.storage },
    getHydrationTelemetry() ?? createTelemetryContext(),
  );
  return () => {
    active = false;
    clearInterval(timer);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", onHide);
  };
}

export function errorFingerprint(error: unknown) {
  let name = "Error";
  let frames = "";
  if (error instanceof Error) {
    if (
      ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError"].includes(error.name)
    ) {
      name = error.name;
    }
    frames = [...(error.stack ?? "").matchAll(/([A-Za-z0-9_-]+\.(?:js|ts|tsx|tsrx)):(\d+):(\d+)/g)]
      .slice(0, 5)
      .map((frame) => frame[0])
      .join(";");
  }
  let hash = 2166136261;
  for (const character of `${name}:${frames}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return `${name}:${(hash >>> 0).toString(16)}`;
}

let vitalsStarted = false;

export async function startWebVitals() {
  if (vitalsStarted || !analyticsAllowed) {
    return;
  }
  vitalsStarted = true;
  try {
    const { onLCP, onINP, onCLS } = await import("web-vitals");
    if (!analyticsAllowed) {
      vitalsStarted = false;
      return;
    }
    const report = ({ name, value }: { name: string; value: number }) => {
      if (analyticsAllowed) {
        reportBrowserEvent("web_vital", {
          metric: name,
          value: name === "CLS" ? value : value / 1000,
        });
      }
    };
    onLCP(report);
    onINP(report);
    onCLS(report);
  } catch {
    vitalsStarted = false;
  }
}

function getHydrationTelemetry() {
  const navigation = performance.getEntriesByType("navigation")[0];
  if (
    typeof PerformanceNavigationTiming === "undefined" ||
    !(navigation instanceof PerformanceNavigationTiming)
  ) {
    return undefined;
  }
  return parseTelemetryContext({
    version: 1,
    traceparent: navigation.serverTiming.find((entry) => entry.name === "traceparent")?.description,
    operationId: navigation.serverTiming.find((entry) => entry.name === "operation")?.description,
  });
}

export function resetBrowserIdentity() {
  queue = [];
  reportingSession = undefined;
}
