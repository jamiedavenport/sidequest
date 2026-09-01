import { Effect, Option, Schema } from "effect";

const httpUrlPattern = /https?:\/\/[^\s<>"'`]+/gi;
const trailingPunctuation = /[.,);!?'"`]+$/;

const PublicHttpUrlFromString = Schema.URLFromString.check(
  Schema.makeFilter((url) => isPublicHttpUrl(url) || "URL is not a public HTTP address."),
);

export function titleMayContainHttpUrl(title: string): boolean {
  return /https?:\/\//i.test(title);
}

export function isPublicHttpUrl(url: URL): boolean {
  return (
    (url.protocol === "http:" || url.protocol === "https:") && !isBlockedHostname(url.hostname)
  );
}

export const extractHttpUrls = Effect.fn("extractHttpUrls")(function* (title: string) {
  const seen = new Set<string>();
  const urls: URL[] = [];
  for (const match of title.matchAll(httpUrlPattern)) {
    const raw = match[0]?.replace(trailingPunctuation, "");
    if (raw === undefined || raw === "") {
      continue;
    }

    const decoded = yield* Schema.decodeUnknownEffect(PublicHttpUrlFromString)(raw).pipe(
      Effect.option,
    );
    if (Option.isNone(decoded) || seen.has(decoded.value.href)) {
      continue;
    }

    seen.add(decoded.value.href);
    urls.push(decoded.value);
  }

  return urls;
});

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }

  const ipv4 = parseIPv4(host);
  if (ipv4 !== undefined) {
    return isPrivateOrLinkLocalIPv4(ipv4);
  }

  return host.includes(":") && isBlockedIPv6(host);
}

function parseIPv4(host: string): readonly [number, number, number, number] | undefined {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined;
    }

    const value = Number(part);
    if (value > 255) {
      return undefined;
    }

    octets.push(value);
  }

  const first = octets[0];
  const second = octets[1];
  const third = octets[2];
  const fourth = octets[3];
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return undefined;
  }

  return [first, second, third, fourth];
}

function isPrivateOrLinkLocalIPv4(octets: readonly [number, number, number, number]): boolean {
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isBlockedIPv6(host: string): boolean {
  if (host === "::1" || host === "::" || host === "0:0:0:0:0:0:0:1") {
    return true;
  }

  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  const ipv4 = mapped?.[1] === undefined ? undefined : parseIPv4(mapped[1]);
  return ipv4 !== undefined && isPrivateOrLinkLocalIPv4(ipv4);
}
