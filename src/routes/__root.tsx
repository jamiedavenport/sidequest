import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { NotFound } from "~/components/not-found.tsrx";
import appStyles from "~/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [
      { href: "https://rsms.me", rel: "preconnect" },
      { href: "https://rsms.me/inter/inter.css", rel: "stylesheet" },
      { href: appStyles, rel: "stylesheet" },
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
      { content: "#f7f7f3", name: "theme-color" },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
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
        {children}
        <Scripts />
      </body>
    </html>
  );
}
