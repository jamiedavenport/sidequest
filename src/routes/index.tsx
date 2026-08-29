import { createFileRoute } from "@tanstack/react-router";

import { Welcome } from "~/components/welcome.tsrx";

export const Route = createFileRoute("/")({
  component: Welcome,
});
