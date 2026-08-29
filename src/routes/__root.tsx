import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import appStyles from "~/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [{ href: appStyles, rel: "stylesheet" }],
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
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
