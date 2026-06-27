/**
 * IP address classification for SSRF defense (R5.3, R5.4).
 *
 * Pure helpers (no I/O) that decide whether an IP address — either an IP
 * *literal* used as a URL host, or an address returned by a DNS lookup — points
 * at a private, reserved, loopback, link-local, multicast or unspecified range
 * that a server-side fetch must never be tricked into reaching. Anything that
 * is not provably one of those ranges is treated as `public`.
 *
 * These helpers back both the URL validator (`validate.ts`, for IP-literal
 * hosts) and the short-link resolver (`resolve.ts`, which re-checks every DNS
 * result on every hop to mitigate DNS rebinding).
 *
 * Note on obfuscated forms: the WHATWG `URL` parser already canonicalizes
 * IPv4 written in decimal/hex/octal (e.g. `0x7f000001` or `2130706433`) to
 * dotted-decimal for special schemes, so by the time a host reaches these
 * helpers it is in canonical form.
 */

/** Category of an IP address; everything not provably special is `public`. */
export type IpCategory =
  | "public"
  | "loopback"
  | "private"
  | "link_local"
  | "reserved"
  | "multicast"
  | "unspecified";

/** Parses a strict dotted-decimal IPv4 string into four octets, or `null`. */
function parseIpv4Octets(value: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (m === null) return null;
  const octets: [number, number, number, number] = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
  ];
  if (octets.some((o) => o > 255)) return null;
  return octets;
}

/** Classifies a dotted-decimal IPv4 string. Returns `null` when not IPv4. */
export function classifyIpv4(value: string): IpCategory | null {
  const octets = parseIpv4Octets(value);
  if (octets === null) return null;
  const [a, b, c] = octets;

  if (a === 0) return "reserved"; //              0.0.0.0/8   "this host"
  if (a === 127) return "loopback"; //            127.0.0.0/8
  if (a === 10) return "private"; //              10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return "private"; //   172.16.0.0/12
  if (a === 192 && b === 168) return "private"; //            192.168.0.0/16
  if (a === 169 && b === 254) return "link_local"; //         169.254.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return "private"; //  100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && c === 0) return "reserved"; //  192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return "reserved"; //  192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return "reserved"; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return "reserved"; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return "reserved"; // 203.0.113.0/24 TEST-NET-3
  if (a >= 240) return "reserved"; //             240.0.0.0/4 (incl. 255.255.255.255)
  if (a >= 224) return "multicast"; //            224.0.0.0/4
  return "public";
}

/** Classifies an IPv6 string (surrounding brackets allowed). `null` if not IPv6. */
export function classifyIpv6(value: string): IpCategory | null {
  let h = value.trim();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (!h.includes(":")) return null;
  const lower = h.toLowerCase();

  if (lower === "::") return "unspecified";
  if (lower === "::1") return "loopback";

  // IPv4-mapped (`::ffff:a.b.c.d`) or IPv4-compatible (`::a.b.c.d`): classify the
  // embedded IPv4 — a mapped private/loopback address is just as dangerous.
  const v4 = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(lower);
  if (v4 !== null) {
    const inner = classifyIpv4(v4[1]);
    if (inner !== null) return inner;
  }

  const firstGroup = lower.split(":")[0];
  // A leading "::" (empty first group) that is not exactly "::" / "::1" / a
  // mapped IPv4 sits in the reserved low range — never treat it as public.
  if (firstGroup === "") return "reserved";

  const val = Number.parseInt(firstGroup, 16);
  if (Number.isNaN(val)) return null;
  const highByte = val >> 8;

  if (highByte === 0xfc || highByte === 0xfd) return "private"; //     fc00::/7  ULA
  if (highByte === 0xfe && (val & 0x00c0) === 0x0080) return "link_local"; // fe80::/10
  if (highByte === 0xff) return "multicast"; //                       ff00::/8
  return "public";
}

/**
 * Classifies any IP literal (IPv4 or IPv6, brackets allowed). Returns `null`
 * when the input is not an IP literal at all (i.e. it is a DNS hostname).
 */
export function classifyIp(value: string): IpCategory | null {
  return classifyIpv4(value) ?? classifyIpv6(value);
}

/** `true` when `value` is an IP literal (v4 or v6), whether public or special. */
export function isIpLiteral(value: string): boolean {
  return classifyIp(value) !== null;
}

/** `true` when `value` is an IP literal in the public range. */
export function isPublicIp(value: string): boolean {
  return classifyIp(value) === "public";
}

/**
 * `true` when `value` is an IP literal that must be blocked (anything that is
 * not a public address). Fails closed: an unparseable value is *not* an IP
 * literal, so callers that receive arbitrary DNS strings should also reject the
 * `classifyIp(...) !== "public"` case directly.
 */
export function isBlockedIp(value: string): boolean {
  const category = classifyIp(value);
  return category !== null && category !== "public";
}
