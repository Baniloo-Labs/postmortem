// SSRF guard for the health-check sensor. Users configure arbitrary URLs to poll,
// so we must block requests to internal, loopback, link-local, and cloud-metadata
// addresses — otherwise a config value could turn postmortem into an SSRF vector
// against the host's own network or a cloud metadata endpoint (169.254.169.254).

import { isIP } from "node:net";

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

/** Validate a user-supplied health-check URL. Blocks non-http(s) and private hosts. */
export function checkUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `unsupported protocol ${url.protocol}` };
  }
  // Strip brackets Node keeps on IPv6 literals ([::1] → ::1) so isIP() works.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host === "") {
    return { ok: false, reason: "localhost is blocked" };
  }
  // Metadata hostnames used by cloud providers.
  if (host === "metadata" || host === "metadata.google.internal") {
    return { ok: false, reason: "metadata host is blocked" };
  }

  const version = isIP(host);
  if (version === 4 && isPrivateIPv4(host)) {
    return { ok: false, reason: `private/loopback IPv4 (${host}) is blocked` };
  }
  if (version === 6 && isPrivateIPv6(host)) {
    return { ok: false, reason: `loopback/link-local IPv6 (${host}) is blocked` };
  }
  return { ok: true };
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const host = ip.toLowerCase();
  if (host === "::1" || host === "::") return true; // loopback / unspecified
  if (host.startsWith("fe80")) return true; // link-local
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:169.254.169.254) — extract and re-check.
  const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return false;
}
