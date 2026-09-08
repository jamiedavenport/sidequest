import { ReportedError } from "~/telemetry/error-boundary.tsrx";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { getSession } from "~/auth/middleware";
import appIcon from "~/assets/icon.svg?url";
import { NotFound } from "~/components/not-found.tsrx";
import { PolicyStack } from "@policystack/react/provider";
import { RootLayout } from "~/components/root-layout.tsrx";
import policy from "~/policystack";
import appStyles from "~/styles.css?url";

export const Route = createRootRoute({
  beforeLoad: async () => {
    const session = await getSession();

    return { session };
  },
  head: () => ({
    links: [
      { href: "https://rsms.me", rel: "preconnect" },
      { href: "https://rsms.me/inter/inter.css", rel: "stylesheet" },
      { href: appStyles, rel: "stylesheet" },
      { href: "/favicon.ico", rel: "icon", sizes: "16x16 32x32 48x48" },
      { href: appIcon, rel: "icon", type: "image/svg+xml", sizes: "any" },
      { href: "/apple-touch-icon.png", rel: "apple-touch-icon", sizes: "180x180" },
    ],
    meta: [
      { charSet: "utf-8" },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      { title: "Sidequest" },
      {
        content: "Sidequest is a task management tool for your projects.",
        name: "description",
      },
      { content: "#ffffff", name: "theme-color" },
    ],
  }),
  notFoundComponent: NotFound,
  errorComponent: ReportedError,
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html
      className="min-h-full min-w-80 bg-background font-sans text-foreground antialiased [font-synthesis:none] [text-rendering:optimizeLegibility]"
      lang="en"
    >
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        <PolicyStack config={policy}>{children}</PolicyStack>
        <Scripts />
      </body>
    </html>
  );
}
