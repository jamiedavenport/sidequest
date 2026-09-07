import { createFileRoute } from "@tanstack/react-router";
import { Component } from "~/routes/privacy.tsrx";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy · Sidequest" }] }),
  component: Component,
});
