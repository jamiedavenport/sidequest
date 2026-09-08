import { useBrowserTelemetry } from "~/telemetry/use-browser-telemetry";
import { Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAnalytics } from "~/lib/use-analytics";
import { PrivacyNotification } from "~/privacy/consent.tsrx";
import { syncConsentStorage } from "~/privacy/storage";

export function RootLayout() @{
  useEffect(syncConsentStorage, []);
  useAnalytics();
  useBrowserTelemetry();

  <>
    <Outlet />
    <PrivacyNotification />
  </>;
}
