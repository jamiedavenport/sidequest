/** Preserve the provider's signed query byte-for-byte through email-code login. */
export function oauthQueryFromSearch(search: string): string | undefined {
  const params = new URLSearchParams(search);
  if (params.has("sig")) return search.replace(/^\?/, "");
  return params.get("oauthQuery") ?? undefined;
}
