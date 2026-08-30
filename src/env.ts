import { createEnv } from "@t3-oss/env-core";
import { Schema } from "effect";

const standard = Schema.toStandardSchemaV1;

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: standard(Schema.String.check(Schema.isMinLength(32))),
    BETTER_AUTH_URL: standard(Schema.URLFromString),
    RESEND_API_KEY: standard(Schema.String.check(Schema.isNonEmpty())),
  },
  clientPrefix: "VITE_",
  client: {},
  runtimeEnvStrict: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  },
  emptyStringAsUndefined: true,
});
