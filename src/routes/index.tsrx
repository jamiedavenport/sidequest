import { getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/");

export function Component() @{
  const { status } = routeApi.useLoaderData();

  <main className="isolate mx-auto w-[min(34rem,calc(100%_-_2rem))] pt-[15vh] pb-16">
    <div className="mb-8 flex w-fit gap-1" aria-hidden="true">
      <span className="size-2.25 rounded-full bg-foreground" />
      <span className="size-2.25 rounded-full bg-foreground opacity-55" />
      <span className="size-2.25 rounded-full bg-foreground opacity-20" />
    </div>
    <div className="flex flex-col items-start gap-3">
      <p className="text-base font-semibold text-muted-foreground sm:text-sm">
        Local-first task management
      </p>
      <h1 className="text-balance text-[clamp(3rem,10vw,5.5rem)] font-semibold tracking-[-0.07em]">
        Sidequest
      </h1>
      <p className="max-w-[30rem] text-pretty text-lg/7 text-muted-foreground sm:text-base/7">
        Sidequest is a task management tool for your projects.
      </p>
    </div>
    <p className="mt-12 border-t border-border pt-4 text-base font-semibold text-muted-foreground sm:text-sm">
      {status}
    </p>
  </main>;
}
