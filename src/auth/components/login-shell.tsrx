import type { ReactNode } from "react";
import { ExternalLinkIcon } from "lucide-react";

import logo from "~/assets/logo.svg?url";

const features = [
  {
    image: "/images/login/lanes.png",
    title: "Lanes & infinite nesting",
    description: "Create your own lanes. Break tasks into as many layers as you need.",
  },
  {
    image: "/images/login/keyboard.png",
    title: "Keyboard shortcuts",
    description: "Create, edit, nest, move, and complete tasks without touching your mouse.",
  },
  {
    image: "/images/login/sync.png",
    title: "Offline + realtime sync",
    description: "Work offline. Reconnect to sync your changes across devices.",
  },
  {
    image: "/images/login/integrations.png",
    title: "GitHub & MCP integrations",
    description: "Sync GitHub issues to a lane. Manage tasks with your AI assistant.",
  },
  {
    image: "/images/login/context.png",
    title: "Notes & whiteboards",
    description: "Add notes, links, and sketches. Keep the context with each task.",
  },
  {
    image: "/images/login/open-source.png",
    title: "Open source",
    description: "Explore the code on GitHub. Available under the Sustainable Use License.",
    href: "https://github.com/jamiedavenport/sidequest",
  },
];

export function LoginShell({ children }: { children: ReactNode }) @{
  <main className="min-h-dvh bg-white text-foreground">
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section
        aria-labelledby="welcome-title"
        className="relative mx-auto flex w-full max-w-2xl flex-col px-4 py-3 sm:px-8 sm:py-5 lg:px-10 lg:py-6 xl:px-14 lg:[@media(max-height:760px)]:py-4"
      >
        <header className="flex items-center justify-between gap-4">
          <img alt="Sidequest" className="h-4 w-auto sm:h-5" src={logo} />
        </header>

        <div className="mt-3 sm:mt-5 lg:mt-6 lg:[@media(max-height:760px)]:mt-4">
          <h1
            className="max-w-lg text-[26px]/[1.08] font-semibold tracking-[-0.045em] text-balance sm:mt-2 sm:text-3xl/[1.08] xl:text-4xl/[1.08]"
            id="welcome-title"
          >
            Less on your mind.
            <br />
            <span className="text-primary">More in your day.</span>
          </h1>
          <p className="mt-2 hidden max-w-md text-sm/5 text-pretty text-neutral-500 sm:block">
            A calm home for tasks, ideas, and side quests.
            <br />
            Designed with ADHD in mind. Built for your next step.
          </p>
        </div>

        <ul
          aria-label="Sidequest features"
          className="absolute top-1/2 -translate-y-1/2 my-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:my-5 sm:gap-y-3 lg:grid-cols-1 lg:[@media(max-height:760px)]:my-4 lg:[@media(max-height:760px)]:gap-y-2"
        >
          @for (const feature of features; key feature.title) {
            <li className="flex items-center gap-2 sm:gap-3">
              <img
                alt=""
                className="size-7 shrink-0 object-contain sm:size-10 lg:size-12 lg:[@media(max-height:650px)]:size-8"
                decoding="async"
                height={48}
                src={feature.image}
                width={48}
              />
              <div>
                <h2 className="text-[11px]/4 font-semibold sm:text-[13px]/5">
                  @if (feature.href) {
                    <a
                      className="inline-flex items-center gap-1 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4"
                      href={feature.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {feature.title}
                      <ExternalLinkIcon aria-hidden="true" className="size-3" />
                    </a>;
                  } @else {
                    <>{feature.title}</>;
                  }
                </h2>
                <p className="hidden max-w-sm text-xs/4 text-pretty text-neutral-500 sm:block lg:[@media(max-height:650px)]:hidden">
                  {feature.description}
                </p>
              </div>
            </li>;
          }
        </ul>

        <section aria-labelledby="pricing-title" className="mt-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight sm:text-base" id="pricing-title">
              Small price. Clear head.
            </h2>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:mt-3">
            <div>
              <h3 className="text-[10px]/4 font-medium tracking-widest text-neutral-500 uppercase">
                Monthly
              </h3>
              <p className="flex items-baseline gap-1">
                <span className="text-3xl font-medium tracking-[-0.06em] sm:text-4xl">$5</span>
                <span className="text-xs text-neutral-500">/ mo</span>
              </p>
              <p className="hidden text-[10px]/4 text-neutral-500 sm:block">A little commitment.</p>
            </div>
            <div>
              <h3 className="text-[10px]/4 font-medium tracking-widest text-neutral-500 uppercase">
                Yearly
              </h3>
              <p className="flex items-baseline gap-1">
                <span className="text-3xl font-medium tracking-[-0.06em] sm:text-4xl">$50</span>
                <span className="text-xs text-neutral-500">/ yr</span>
              </p>
              <p className="text-[10px]/4 font-medium text-primary">Two months free.</p>
            </div>
          </div>
          <p className="mt-2 text-xs/4 sm:mt-3">
            14 days free. <span className="text-neutral-500">No card needed.</span>
          </p>
          <p className="mt-1 text-[10px]/4 text-neutral-500">
            USD. Tax varies by location; final total shown at checkout.
          </p>
        </section>
      </section>

      <section
        aria-labelledby="sign-in-title"
        className="flex scroll-mt-3 items-center justify-center border-t border-border bg-white px-4 py-4 [--primary:#000] [--primary-foreground:#fff] sm:px-8 sm:py-6 lg:border-t-0 lg:border-l"
        id="sign-in"
      >
        <div className="w-full max-w-xs">
          <div className="flex flex-col gap-4 sm:gap-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight" id="sign-in-title">
                Sign in
              </h2>
              <p className="mt-1 text-xs/5 text-muted-foreground">
                Enter your email and we’ll send you a sign-in code.
              </p>
            </div>
            {children}
          </div>
          <p className="mt-4 hidden text-center text-[11px]/5 text-neutral-500 sm:block">
            New here? Signing in creates your account.
            <br />
            Your 14-day free trial starts with your first sign-in.
          </p>
        </div>
      </section>
    </div>
  </main>;
}
