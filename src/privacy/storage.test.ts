import { afterEach, describe, expect, it, vi } from "vitest";
import { createConsentStore } from "@policystack/core/consent";
import policy from "~/policystack";
import { consentKey, consentLifetime, readConsent, syncConsentStorage } from "./storage";

function setup() {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  return { storage, store: createConsentStore(policy) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("consent storage", () => {
  it("fails closed for unavailable, invalid, future, expired or changed consent", async () => {
    const { store, storage } = setup();
    store.acceptAll();
    const record = store.getConsentRecord();
    expect(record).not.toBeNull();
    for (const value of [
      "invalid",
      "{}",
      JSON.stringify({ ...record, decidedAt: "invalid" }),
      JSON.stringify({ ...record, decidedAt: new Date(Date.now() + 60_000).toISOString() }),
      JSON.stringify({
        ...record,
        decidedAt: new Date(Date.now() - consentLifetime).toISOString(),
      }),
    ]) {
      storage.set(consentKey, value);
      expect(readConsent()).toBeNull();
      expect(createConsentStore(policy).has("analytics")).toBe(false);
    }
    storage.set(consentKey, JSON.stringify({ ...record, policyVersion: "old" }));
    expect(createConsentStore(policy).has("analytics")).toBe(false);
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    store.acceptAll();
    expect(readConsent()).toBeNull();
  });

  it("revokes cross-tab deleted storage and expires open tabs without discarding unchanged preference drafts", async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    vi.stubGlobal("window", {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      setInterval,
      clearInterval,
    });
    vi.stubGlobal("document", new EventTarget());
    const { store, storage } = setup();
    store.acceptAll();
    const stop = syncConsentStorage();
    store.setRoute("preferences");
    store.toggle("analytics");
    vi.advanceTimersByTime(60_000);
    expect(store.getState().draft?.analytics).toBe(false);
    expect(store.has("analytics")).toBe(true);
    storage.delete(consentKey);
    events.dispatchEvent(new Event("focus"));
    expect(store.has("analytics")).toBe(false);
    expect(store.getState().route).toBe("cookie");
    store.acceptAll();
    vi.setSystemTime(Date.now() + consentLifetime);
    vi.advanceTimersByTime(60_000);
    expect(store.has("analytics")).toBe(false);
    expect(store.getState().route).toBe("cookie");
    stop();
  });
});
