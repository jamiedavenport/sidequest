import { getRouteApi } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { Button } from "~/components/ui/button.tsrx";
import { getRandomNumber } from "~/random/server";

const routeApi = getRouteApi("/");

export function Component() @{
  const { status } = routeApi.useLoaderData();
  const [number, setNumber] = useState<number | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    console.log("handleGenerate");
    setIsPending(true);
    setError(null);

    try {
      const nextNumber = await getRandomNumber();
      console.log("nextNumber", nextNumber);
      setNumber(nextNumber);
      setRequestCount((current) => current + 1);
    } catch (caughtError) {
      console.error(caughtError);
      setError("The server could not generate a number. Please try again.");
    } finally {
      setIsPending(false);
    }
  }, []);

  <main className="isolate mx-auto flex min-h-dvh w-[min(34rem,calc(100%_-_2rem))] flex-col justify-center gap-12 py-16">
    <div className="flex flex-col gap-8">
      <div className="flex w-fit gap-1" aria-hidden="true">
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
    </div>
    <section className="border-t border-border pt-6" aria-labelledby="effect-demo-title">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-semibold text-primary sm:text-sm">
            Effect 4 full-stack demo
          </p>
          <h2 className="text-balance text-2xl font-semibold tracking-tight" id="effect-demo-title">
            A number from the server
          </h2>
          <p className="max-w-[48ch] text-pretty text-base/7 text-muted-foreground sm:text-sm/6">
            TanStack Start calls an Effect program on the server. React keeps the result and request
            count as local UI state.
          </p>
        </div>

        <div className="flex items-center gap-5" aria-busy={isPending} aria-live="polite">
          <p className="min-w-0 flex-1 tabular-nums text-[clamp(3rem,12vw,5rem)] font-semibold tracking-[-0.06em]">
            {number ?? "—"}
          </p>
          <Button disabled={isPending} onClick={handleGenerate} type="button">
            {isPending ? "Generating…" : "Generate number"}
          </Button>
        </div>

        @if (error !== null) {
          <p className="text-pretty text-base/7 text-destructive sm:text-sm/6" role="alert">
            {error}
          </p>;
        }

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4 text-base font-semibold text-muted-foreground sm:text-sm">
          <p>{status}</p>
          <p className="shrink-0 tabular-nums">
            {requestCount} {requestCount === 1 ? "request" : "requests"}
          </p>
        </div>
      </div>
    </section>
  </main>;
}
