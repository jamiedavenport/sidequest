import { OpenPanel } from "@openpanel/web";

let openpanel: OpenPanel | undefined;

export function initializePageTracking() {
  if (!import.meta.env.SSR) {
    openpanel ??= new OpenPanel({
      clientId: "dc8f0e1f-3e72-4a7d-9fa1-98bacb510601",
      trackScreenViews: true,
    });
  }
}
