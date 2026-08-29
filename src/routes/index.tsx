import { createFileRoute } from "@tanstack/react-router";

import { Component } from "~/routes/index.tsrx";

export const Route = createFileRoute("/")({
  component: Component,
});
