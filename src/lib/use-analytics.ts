import type { OpenPanel } from "@openpanel/web";
import { useConsent } from "@policystack/react/consent";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const pages = new Set(["/", "/billing", "/connections"]);

export function useAnalytics() {
  const { has } = useConsent();
  const analytics = has("analytics");
  const pathname = useRouterState({ select: (state) => state.resolvedLocation?.pathname });
  const [client, setClient] = useState<OpenPanel | null>(null);

  useEffect(() => {
    if (!analytics) {
      return undefined;
    }
    let active = true;
    let openpanel: OpenPanel | undefined;
    const allowed = () => active && has("analytics");
    if (!allowed()) {
      return undefined;
    }
    void import("@openpanel/web")
      .then(({ OpenPanel }) => {
        if (!allowed()) {
          return;
        }
        openpanel = new OpenPanel({
          clientId: "dc8f0e1f-3e72-4a7d-9fa1-98bacb510601",
          trackScreenViews: false,
          trackOutgoingLinks: false,
          trackAttributes: false,
          sessionReplay: { enabled: false },
          filter: allowed,
        });
        openpanel.setGlobalProperties({ __referrer: "" });
        setClient(openpanel);
      })
      .catch(() => {
        // Optional analytics must not prevent the app from working.
      });
    return () => {
      active = false;
      openpanel?.clear();
      setClient(null);
    };
  }, [analytics, has]);

  useEffect(() => {
    if (analytics && pathname && pages.has(pathname)) {
      client?.screenView(pathname);
    }
  }, [analytics, client, pathname]);
}
