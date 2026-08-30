import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

import { db } from "~/db/client";
import * as schema from "~/db/schema";
import { verification } from "~/db/schema";
import { env } from "~/env";

const EMAIL_CODE_EXPIRY_MINUTES = 5;
const EMAIL_SENDER = "Sidequest <login@sdqst.app>";

const resend = new Resend(env.RESEND_API_KEY);

async function deliverSignInCode(email: string, otp: string): Promise<void> {
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
}

function signInCodeIdentifier(email: string): string {
  return `sign-in-otp-${email}`;
}

function deleteSignInCode(email: string): Promise<unknown> {
  return db.delete(verification).where(eq(verification.identifier, signInCodeIdentifier(email)));
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL.href,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  plugins: [
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

export type AuthSession = typeof auth.$Infer.Session;

export async function issueSignInCode(email: string): Promise<boolean> {
  await deleteSignInCode(email);
  const otp = await auth.api.createVerificationOTP({
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
