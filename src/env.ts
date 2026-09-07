import { createEnv } from "@t3-oss/env-core";
import { Schema } from "effect";

const standard = Schema.toStandardSchemaV1;

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: standard(Schema.String.check(Schema.isMinLength(32))),
    BETTER_AUTH_URL: standard(Schema.URLFromString),
    RESEND_API_KEY: standard(Schema.String.check(Schema.isNonEmpty())),
    BILLING_CHECKOUT_ENABLED: standard(Schema.optional(Schema.Literals(["true", "false"]))),
    BILLING_ENFORCEMENT_ENABLED: standard(Schema.optional(Schema.Literals(["true", "false"]))),
    POLAR_SERVER: standard(Schema.optional(Schema.Literals(["sandbox", "production"]))),
    POLAR_ACCESS_TOKEN: standard(Schema.optional(Schema.NonEmptyString)),
    POLAR_WEBHOOK_SECRET: standard(Schema.optional(Schema.NonEmptyString)),
    POLAR_ORGANIZATION_ID: standard(Schema.optional(Schema.NonEmptyString)),
    POLAR_MONTHLY_PRODUCT_ID: standard(Schema.optional(Schema.NonEmptyString)),
    POLAR_ANNUAL_PRODUCT_ID: standard(Schema.optional(Schema.NonEmptyString)),
    MCP_ALLOWED_ORIGINS: standard(Schema.optional(Schema.String)),
    E2E_MODE: standard(Schema.optional(Schema.Literals(["0", "1"]))),
    E2E_SESSION_SECRET: standard(Schema.optional(Schema.NonEmptyString)),
  },
  clientPrefix: "VITE_",
  client: {},
  runtimeEnvStrict: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    BILLING_CHECKOUT_ENABLED: process.env.BILLING_CHECKOUT_ENABLED,
    BILLING_ENFORCEMENT_ENABLED: process.env.BILLING_ENFORCEMENT_ENABLED,
    POLAR_SERVER: process.env.POLAR_SERVER,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_ORGANIZATION_ID: process.env.POLAR_ORGANIZATION_ID,
    POLAR_MONTHLY_PRODUCT_ID: process.env.POLAR_MONTHLY_PRODUCT_ID,
    POLAR_ANNUAL_PRODUCT_ID: process.env.POLAR_ANNUAL_PRODUCT_ID,
    MCP_ALLOWED_ORIGINS: process.env.MCP_ALLOWED_ORIGINS,
    E2E_MODE: process.env.E2E_MODE,
    E2E_SESSION_SECRET: process.env.E2E_SESSION_SECRET,
  },
  emptyStringAsUndefined: true,
});
