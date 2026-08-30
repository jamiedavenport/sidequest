import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { loginFormSchema } from "~/auth/schema";
import { auth, issueSignInCode } from "~/auth/server";

export const sessionMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  });

  return next({ context: { session } });
});

export const requiredSessionMiddleware = createMiddleware({ type: "function" })
  .middleware([sessionMiddleware])
  .server(({ context, next }) => {
    if (context.session === null) {
      throw new Error("Unauthorized");
    }

    return next({ context: { session: context.session } });
  });

export const getSession = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(({ context }) => context.session);

export const requireSession = createServerFn({ method: "GET" })
  .middleware([requiredSessionMiddleware])
  .handler(({ context }) => context.session);

export const sendSignInCode = createServerFn({ method: "POST" })
  .validator(loginFormSchema)
  .handler(({ data }) => issueSignInCode(data.email.trim().toLowerCase()));
