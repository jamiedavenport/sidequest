export function assertBillingOrigin(headers: Headers, origin: string) {
  if (headers.get("origin") !== new URL(origin).origin) {
    throw new Error("Origin is not allowed.");
  }
}
