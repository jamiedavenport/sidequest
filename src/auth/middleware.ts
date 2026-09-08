import { annotateOperation } from "~/telemetry/runtime";
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { loginFormSchema } from "~/auth/schema";
import { createAuth, issueSignInCode } from "~/auth/server";

const sessionMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await createAuth().api.getSession({
    headers: getRequestHeaders(),
  });

  if (session) {
    annotateOperation({ accountId: session.user.id });
  }
  return next({ context: { session } });
});

export const getSession = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(({ context }) => context.session);

export const sendSignInCode = createServerFn({ method: "POST" })
  .validator(loginFormSchema)
  .handler(async ({ data }) => {
    const sent = await issueSignInCode(data.email.trim().toLowerCase());
    if (!sent) {
      annotateOperation({ outcome: "unexpected_failure", failureStage: "email_delivery" });
    }
    return sent;
  });
