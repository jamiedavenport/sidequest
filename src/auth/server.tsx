import { observeOperation } from "~/telemetry/runtime";
import { captureTelemetryContext } from "~/telemetry/runtime";
import { env as bindings } from "cloudflare:workers";
import { BoardSeedError } from "~/board/seeds/schema";
import { oauthProvider } from "@better-auth/oauth-provider";
import { mcpTokenPlugin, oauthOptions } from "~/mcp/oauth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { Resend } from "resend";

import { db } from "~/db/client";
import * as schema from "~/db/schema";
import { verification } from "~/db/schema";
import { env } from "~/env";
import { serverRuntime } from "~/server/runtime";

const EMAIL_CODE_EXPIRY_MINUTES = 5;

const EMAIL_SENDER = "Sidequest <login@sdqst.app>";

const resend = new Resend(env.RESEND_API_KEY);

function createWelcomeEmailText(): string {
  return [
    "Hey,",
    "",
    "I'm Jamie, the person building Sidequest. Thanks for giving it a go.",
    "",
    "I'd love to hear what you're using it for, what feels good, and what",
    "gets in your way. If you have an idea, a question, or just a thought,",
    "hit reply. It'll come straight to me at x@jxd.dev.",
    "",
    "You're welcome to join the community too:",
    "https://sdqst.communities.buzz.xyz/invite/v2.v823vjCjiGvULFJUy6v0l87YMoSKo5sRlT8nhVRsS84",
    "",
    "And if you're curious about the code:",
    "https://github.com/jamiedavenport/sidequest",
    "",
    "Hope Sidequest helps make a little more room in your day.",
    "",
    "Jamie",
  ].join("\n");
}

class WelcomeEmailError extends Schema.TaggedError<WelcomeEmailError>()("WelcomeEmailError", {
  message: Schema.String,
}) {}

const welcomeNewUser = Effect.fn("welcomeNewUser")(function* (user: {
  id: string;
  email: string;
  emailVerified: boolean;
}) {
  yield* Effect.tryPromise({
    try: () => bindings.BOARD.getByName(user.id).seedOnboarding(user.id, captureTelemetryContext()),
    catch: () => new BoardSeedError({ message: "Onboarding board initialization failed." }),
  }).pipe(
    Effect.catchTag("BoardSeedError", (error) =>
      Effect.logError("Could not seed onboarding board.", { message: error.message }),
    ),
  );
  if (user.emailVerified) {
    yield* sendWelcomeEmail(user.email).pipe(
      Effect.catchTag("WelcomeEmailError", (error) =>
        Effect.logError("Could not send welcome email.", { message: error.message }),
      ),
    );
  }
});

const sendWelcomeEmail = Effect.fn("sendWelcomeEmail")(function* (
  email: string,
): Effect.fn.Return<void, WelcomeEmailError> {
  const { error } = yield* Effect.tryPromise({
    try: () =>
      resend.emails.send({
        from: "Jamie from Sidequest <login@sdqst.app>",
        replyTo: "x@jxd.dev",
        subject: "A quick hello from Jamie",
        text: createWelcomeEmailText(),
        to: email,
      }),
    catch: () => new WelcomeEmailError({ message: "Could not reach Resend." }),
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(new WelcomeEmailError({ message: "Welcome email delivery timed out." })),
    ),
  );

  if (error !== null) {
    return yield* new WelcomeEmailError({ message: `Resend rejected the email: ${error.name}.` });
  }
  return undefined;
});

async function deliverSignInCode(email: string, otp: string): Promise<void> {
  return observeOperation(
    "auth.deliverSignInCode",
    async () => {
      const { error } = await resend.emails.send({
        from: EMAIL_SENDER,
        subject: `${otp} is your Sidequest sign-in code`,
        text: [
          "Your Sidequest sign-in code is:",
          "",
          otp,
          "",
          `This code expires in ${EMAIL_CODE_EXPIRY_MINUTES} minutes.`,
          "If you did not request this code, you can safely ignore this email. Never share this code with anyone.",
        ].join("\n"),
        to: email,
      });

      if (error !== null) {
        throw new Error(`Resend could not deliver the sign-in code: ${error.message}`);
      }
    },
    { component: "auth", category: "integration" },
  );
}

function signInCodeIdentifier(email: string): string {
  return `sign-in-otp-${email}`;
}

function deleteSignInCode(email: string): Promise<unknown> {
  return db.delete(verification).where(eq(verification.identifier, signInCodeIdentifier(email)));
}

const providerOptions = oauthOptions(env.BETTER_AUTH_URL.href);

// OAuth initialization queries D1, so create auth inside the request that uses it.
export function createAuth() {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL.href,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    databaseHooks: {
      user: {
        create: {
          after(user) {
            return serverRuntime.runPromise(welcomeNewUser(user));
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    account: {
      encryptOAuthTokens: true,
      accountLinking: { allowDifferentEmails: true, requireLocalEmailVerified: true },
    },
    socialProviders: {
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
              disableDefaultScope: true,
            },
          }
        : {}),
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              accessType: "online",
            },
          }
        : {}),
    },
    plugins: [
      oauthProvider(providerOptions),
      mcpTokenPlugin(providerOptions),
      emailOTP({
        allowedAttempts: 3,
        disableSignUp: false,
        expiresIn: EMAIL_CODE_EXPIRY_MINUTES * 60,
        otpLength: 6,
        resendStrategy: "rotate",
        async sendVerificationOTP({ email, otp }) {
          try {
            await deliverSignInCode(email, otp);
          } catch (error) {
            await deleteSignInCode(email);
            throw error;
          }
        },
        storeOTP: "hashed",
      }),
      tanstackStartCookies(),
    ],
  });
}

export async function issueSignInCode(email: string): Promise<boolean> {
  await deleteSignInCode(email);
  const otp = await createAuth().api.createVerificationOTP({
    body: { email, type: "sign-in" },
  });

  try {
    await deliverSignInCode(email, otp);
    return true;
  } catch {
    await deleteSignInCode(email);
    return false;
  }
}
