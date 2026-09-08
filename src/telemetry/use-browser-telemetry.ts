import { useConsent } from "@policystack/react/consent";
import { useRouteContext, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  reportBrowserEvent,
  resetBrowserIdentity,
  setTelemetryConsent,
  startBrowserTelemetry,
  startWebVitals,
} from "./browser";

export function useBrowserTelemetry() {
  const { has } = useConsent();
  const { session } = useRouteContext({ from: "__root__" });
  const accountId = session?.user.id;
  const analytics = has("analytics");
  const pathname = useRouterState({ select: (state) => state.resolvedLocation?.pathname });
  useEffect(resetBrowserIdentity, [accountId]);
  useEffect(startBrowserTelemetry, []);
  useEffect(() => {
    setTelemetryConsent(analytics);
    if (analytics) {
      void startWebVitals();
    }
    return () => setTelemetryConsent(false);
  }, [analytics]);
  useEffect(() => {
    if (analytics && pathname && ["/", "/billing", "/connections"].includes(pathname)) {
      reportBrowserEvent("navigation", {
        operation: pathname === "/" ? "board" : pathname.slice(1),
      });
    }
  }, [analytics, pathname]);
}
