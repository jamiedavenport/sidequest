import { createFileRoute } from "@tanstack/react-router";
import { Component } from "~/routes/cookies.tsrx";

export const Route = createFileRoute("/cookies")({
  head: () => ({ meta: [{ title: "Cookie policy · Sidequest" }] }),
  component: Component,
});
