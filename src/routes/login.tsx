import { createFileRoute } from "@tanstack/react-router";

import { Component } from "~/routes/login.tsrx";

export const Route = createFileRoute("/login")({
  component: Component,
});
