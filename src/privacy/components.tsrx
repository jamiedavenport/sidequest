// Scrollable tables must be keyboard focusable.
// oxlint-disable jsx-a11y/no-noninteractive-tabindex
import type { PolicyComponents } from "@policystack/react/policy";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PrivacyNavigation } from "~/privacy/consent.tsrx";

export const policyComponents: PolicyComponents = {
  Root: ({ children }) => @{
    <article className="min-w-0 space-y-10" data-policy-document>
      {children}
    </article>;
  },
  Section: ({ node, children }) => @{
    <section className="min-w-0 scroll-mt-6 space-y-4" id={node.id}>
      {children}
    </section>;
  },
  Heading: ({ node }) => @{
    const Tag = `h${node.level ?? 2}` as const;
    <Tag className="text-xl font-semibold tracking-tight text-balance">{node.value}</Tag>;
  },
  Paragraph: ({ children }) => @{
    <p className="text-sm/7 text-pretty text-muted-foreground">{children}</p>;
  },
  Link: ({ node }) => @{
    <a
      className="break-words text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
      href={node.href}
    >
      {node.value}
    </a>;
  },
  List: ({ node, children }) => @{
    const Tag = node.ordered ? "ol" : "ul";
    <Tag
      className={
        node.ordered
          ? "list-decimal space-y-2 pl-6 text-sm/7 text-muted-foreground"
          : "list-disc space-y-2 pl-6 text-sm/7 text-muted-foreground"
      }
    >
      {children}
    </Tag>;
  },
  ListItem: ({ children }) => @{
    <li>{children}</li>;
  },
  Table: ({ children }) => @{
    <section
      className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-4"
      aria-label="Policy details"
      tabIndex={0}
    >
      <table className="w-full min-w-xl border-collapse text-left text-sm/6">
        <tbody>{children}</tbody>
      </table>
    </section>;
  },
  TableHeaderRow: ({ children }) => @{
    <tr className="bg-muted/50">{children}</tr>;
  },
  TableHeaderCell: ({ children }) => @{
    <th scope="col" className="px-4 py-3 align-top font-medium">
      {children}
    </th>;
  },
  TableRow: ({ children }) => @{
    <tr className="border-t border-border">{children}</tr>;
  },
  TableCell: ({ children }) => @{
    <td className="px-4 py-3 align-top text-muted-foreground">{children}</td>;
  },
};

export function PolicyPage({ title, children }: { title: string; children: ReactNode }) @{
  <div className="min-h-dvh bg-background px-5 pb-56 sm:px-8">
    <header className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-5 py-8">
      <Link
        className="text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4"
        to="/"
      >
        ← Sidequest
      </Link>
      <PrivacyNavigation />
    </header>
    <main className="mx-auto w-full max-w-4xl space-y-10 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  </div>;
}
