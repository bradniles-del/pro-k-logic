import { SHORT_CODE_REGEX } from "@prok/shared";

/**
 * What a scan or a typed value can mean. QR labels encode a URL ending in
 * /s/<token>; paint-marked units carry the short code PKL-XXXX-XXXX.
 */
export type ParsedCode = { kind: "token"; value: string } | { kind: "short_code"; value: string };

const TOKEN_RE = /^[A-Za-z0-9_-]{8,}$/;

/** Normalises user input into a short code: uppercases, strips spaces, adds dashes. */
export function normalizeShortCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("PKL") ? raw.slice(3) : raw;
  if (body.length !== 8) return null;
  const code = `PKL-${body.slice(0, 4)}-${body.slice(4)}`;
  return SHORT_CODE_REGEX.test(code) ? code : null;
}

/**
 * Parses a scanned QR payload or a typed value.
 *  - https://host/s/<token>, prok://s/<token>, or a bare path /s/<token>
 *  - a bare short code (PKL-XXXX-XXXX, dashes and case optional)
 *  - a bare token
 */
export function parseCode(raw: string): ParsedCode | null {
  const text = raw.trim();
  if (!text) return null;

  const m = text.match(/\/s\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/);
  if (m?.[1]) return { kind: "token", value: m[1] };

  const short = normalizeShortCode(text);
  if (short) return { kind: "short_code", value: short };

  if (TOKEN_RE.test(text)) return { kind: "token", value: text };
  return null;
}

/** The item route accepts either form; short codes are recognised by their prefix. */
export function isShortCode(param: string): boolean {
  return SHORT_CODE_REGEX.test(param);
}
