import { ErrorComponent, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { errorFingerprint, flushBrowserEvents, reportBrowserEvent } from "./browser";

export function ReportedError(props: ErrorComponentProps) @{
  useEffect(() => {
    reportBrowserEvent("render_error", { fingerprint: errorFingerprint(props.error) });
    void flushBrowserEvents();
  }, [props.error]);
  <ErrorComponent {...props} />;
}
