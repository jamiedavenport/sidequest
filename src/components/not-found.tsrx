import { Link } from "@tanstack/react-router";
import { createElement } from "react";

import { Button } from "@/components/ui/button.tsrx";

export function NotFound() @{
  const homeLink = createElement(Link, { to: "/" });

  <main className="isolate mx-auto w-[min(34rem,calc(100%_-_2rem))] pt-[15vh] pb-16">
    <p className="text-base font-semibold text-muted-foreground sm:text-sm">404</p>
    <h1 className="mt-3 text-balance text-[clamp(3rem,10vw,5.5rem)] font-semibold tracking-[-0.07em]">
      Page not found
    </h1>
    <p className="mt-4 max-w-[30rem] text-pretty text-lg/7 text-muted-foreground sm:text-base/7">
      The page you requested does not exist or may have moved.
    </p>
    <Button className="mt-8" nativeButton={false} render={homeLink}>
      Return home
    </Button>
  </main>;
}
