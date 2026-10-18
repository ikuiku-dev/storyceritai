// src/lib/net/ssrf.ts — SSRF protection for every outbound request to a user-supplied URL.
// Rules: http/https only · public IPs only · ports 80/443 · max 3 redirects, re-validated each hop ·
// no scheme downgrade · byte cap · timeout.
import "server-only";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const PRIVATE_V4 = [
  [/^0\./, "0.0.0.0/8"],
  [/^10\./, "10.0.0.0/8"],
  [/^127\./, "loopback"],
  [/^169\.254\./, "link-local / cloud metadata"],
  [/^172\.(1[6-9]|2\d|3[01])\./, "172.16.0.0/12"],
  [/^192\.168\./, "192.168.0.0/16"],
  [/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, "CGNAT 100.64/10"],
  [/^19[89]\.18\./, "benchmarking"],
  [/^2(2[4-9]|3\d|4\d|5[0-5])\./, "multicast/reserved"],
  [/^255\./, "broadcast"],
] as const;

export function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_V4.some(([re]) => re.test(ip));
}

export function isBlockedIPv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // ::ffff:127.0.0.1 style
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (s === "::1" || s === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(s)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(s)) return true; // fe80::/10 link local
  if (/^ff[0-9a-f]{2}:/.test(s)) return true; // multicast
  return false;
}

export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (["localhost", "metadata", "metadata.google.internal", "instance-data"].includes(h)) return true;
  if (/\.(localhost|internal|local|lan|home|corp)$/.test(h)) return true;
  if (/^\d+$/.test(h)) return true; // decimal-encoded IP
  if (/^0x[0-9a-f]+$/i.test(h)) return true; // hex-encoded IP
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  // URL hostnames wrap IPv6 literals in brackets ("[::1]"); strip them so the literal-IP
  // checks below actually run. Without this, "[::1]" falls through to DNS and is rejected
  // only by luck (resolution failure) instead of by the SSRF rule.
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (isBlockedHostname(bare)) throw new SsrfError(`Blocked hostname: ${hostname}`);
  // Literal IP?
  const { isIP } = await import("node:net");
  if (isIP(bare) === 4 && isPrivateIPv4(bare)) throw new SsrfError(`Private IPv4 blocked: ${bare}`);
  if (isIP(bare) === 6 && isBlockedIPv6(bare)) throw new SsrfError(`Private IPv6 blocked: ${bare}`);
  // Resolve — DNS rebinding check. A literal IP needs no lookup.
  if (isIP(bare)) return;
  const dns = await import("node:dns/promises");
  let addrs: { address: string }[] = [];
  try {
    addrs = await dns.lookup(bare, { all: true });
  } catch {
    throw new SsrfError(`DNS resolution failed for ${bare}`);
  }
  if (!addrs.length) throw new SsrfError(`No DNS records for ${bare}`);
  for (const a of addrs) {
    if (isPrivateIPv4(a.address) || isBlockedIPv6(a.address)) {
      throw new SsrfError(`Host resolves to a private address (${a.address}) — blocked`);
    }
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
}

export interface SafeFetchResult {
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
  truncated: boolean;
}

/** Fetch a user-supplied URL with SSRF, size and timeout protection. Throws SsrfError on policy violation. */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 10_000, maxBytes = 5 * 1024 * 1024, maxRedirects = 3, accept = "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8" } = opts;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new SsrfError("Only http(s) URLs are allowed");

  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!["http:", "https:"].includes(current.protocol)) throw new SsrfError("Redirect to a non-http(s) scheme blocked");
    const port = current.port ? Number(current.port) : current.protocol === "https:" ? 443 : 80;
    if (![80, 443].includes(port)) throw new SsrfError(`Port ${port} is not allowed`);
    await assertPublicHost(current.hostname);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": "CeritaLabBot/1.0 (+user-initiated research)", accept },
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === "AbortError") throw new SsrfError(`Request timed out after ${timeoutMs}ms`);
      throw new SsrfError(`Fetch failed: ${(e as Error).message}`);
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new SsrfError(`Redirect without Location (${res.status})`);
      const next = new URL(loc, current);
      if (current.protocol === "https:" && next.protocol === "http:") throw new SsrfError("HTTPS→HTTP downgrade blocked");
      current = next;
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/|application\/(json|xml|xhtml)/i.test(contentType) && contentType) {
      throw new SsrfError(`Unsupported content type: ${contentType.split(";")[0]}`);
    }

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    return { status: res.status, contentType, body, finalUrl: current.toString(), truncated };
  }
  throw new SsrfError(`Too many redirects (max ${maxRedirects})`);
}
