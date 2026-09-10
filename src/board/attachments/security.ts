import { Effect } from "effect";
import { createAuth } from "~/auth/server";
import { assertBillingOrigin } from "~/billing/security";
import { env } from "~/env";
import { AttachmentError } from "./schema";

export const getAttachmentUser = Effect.fn("getAttachmentUser")(function* (
  headers: Headers,
  write = false,
) {
  if (write) {
    yield* Effect.try({
      try: () => assertBillingOrigin(headers, env.BETTER_AUTH_URL.href),
      catch: () => new AttachmentError({ message: "Invalid request origin.", status: 403 }),
    });
  }
  const session = yield* Effect.tryPromise({
    try: () => createAuth().api.getSession({ headers }),
    catch: () => new AttachmentError({ message: "Could not check your session.", status: 503 }),
  });
  if (!session) {
    return yield* new AttachmentError({ message: "Sign in to access attachments.", status: 401 });
  }
  return session.user.id;
});
