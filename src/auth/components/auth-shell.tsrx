import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import logo from "~/assets/logo.svg?url";

export function AuthShell({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  title: string;
}) @{
  <main className="min-h-dvh bg-white text-foreground">
    <div className="mx-auto flex min-h-dvh w-full max-w-xs flex-col px-6 sm:px-0">
      <header className="flex h-20 shrink-0 items-center">
        <Link aria-label="Homepage" to="/">
          <img alt="" className="h-5 w-auto" src={logo} />
        </Link>
      </header>

      <div className="flex flex-1 items-center pb-20">
        <div className="flex w-full flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            <div className="text-base/7 text-pretty text-muted-foreground sm:text-sm/6">
              {description}
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  </main>;
}
