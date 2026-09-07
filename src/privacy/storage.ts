import type { ConsentRecord, StorageAdapter } from "@policystack/core/consent";

export const consentKey = "sidequest-consent";

export const consentLifetime = 180 * 24 * 60 * 60 * 1000;

let observed: string | undefined;

const listeners = new Set<(record: ConsentRecord | null) => void>();

// An invalidated record makes PolicyStack re-prompt. V1 ignores null updates.
const invalidated: ConsentRecord = {
  schemaVersion: 1,
  decisions: { essential: true, analytics: false },
  policyVersion: "invalidated",
  decidedAt: "1970-01-01T00:00:00.000Z",
  jurisdiction: null,
  locale: "en",
  source: "import",
};

export function readConsent(): ConsentRecord | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(consentKey) ?? "null");
    if (typeof raw !== "object" || raw === null) {
      return null;
    }
    if (
      !("schemaVersion" in raw) ||
      raw.schemaVersion !== 1 ||
      !("policyVersion" in raw) ||
      typeof raw.policyVersion !== "string" ||
      !("decidedAt" in raw) ||
      typeof raw.decidedAt !== "string" ||
      !("decisions" in raw) ||
      typeof raw.decisions !== "object" ||
      raw.decisions === null ||
      !("essential" in raw.decisions) ||
      raw.decisions.essential !== true ||
      !("analytics" in raw.decisions) ||
      typeof raw.decisions.analytics !== "boolean"
    ) {
      return null;
    }
    const age = Date.now() - Date.parse(raw.decidedAt);
    if (!Number.isFinite(age) || age < 0 || age >= consentLifetime) {
      return null;
    }
    return {
      schemaVersion: 1,
      decisions: { essential: true, analytics: raw.decisions.analytics },
      policyVersion: raw.policyVersion,
      decidedAt: raw.decidedAt,
      jurisdiction: null,
      locale: "en",
      source: "import",
    };
  } catch {
    return null;
  }
}

export const consentStorage: StorageAdapter = {
  read: readConsent,
  write(record) {
    try {
      localStorage.setItem(consentKey, JSON.stringify(record));
      observed = JSON.stringify(readConsent());
    } catch {
      // The current consent decision remains in memory if it cannot persist.
    }
  },
  clear() {
    try {
      localStorage.removeItem(consentKey);
    } catch {
      // Browser storage may be unavailable.
    }
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function syncConsentStorage() {
  observed = JSON.stringify(readConsent());
  const refresh = () => {
    const current = readConsent();
    const encoded = JSON.stringify(current);
    if (encoded === observed) {
      return;
    }
    observed = encoded;
    const record = current ?? invalidated;
    for (const listener of listeners) {
      listener(record);
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === consentKey || event.key === null) {
      refresh();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  const timer = window.setInterval(refresh, 60_000);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
    window.clearInterval(timer);
  };
}
