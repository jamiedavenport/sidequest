import { Schema } from "effect";

const EmailAddress = Schema.String.check(
  Schema.isNonEmpty({ message: "Enter your email address." }),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: "Enter a valid email address.",
  }),
);

export const LoginValues = Schema.Struct({
  email: EmailAddress,
});
export type LoginValues = typeof LoginValues.Type;

export const loginFormSchema = Schema.toStandardSchemaV1(LoginValues);

export const VerificationCodeValues = Schema.Struct({
  code: Schema.String.check(
    Schema.isPattern(/^\d{6}$/, { message: "Enter the six-digit code." }),
  ),
});
export type VerificationCodeValues = typeof VerificationCodeValues.Type;

export const verificationCodeFormSchema = Schema.toStandardSchemaV1(
  VerificationCodeValues,
);

const CodeSearch = Schema.Struct({
  email: Schema.optionalKey(Schema.String),
});

export const codeSearchSchema = Schema.toStandardSchemaV1(CodeSearch);
