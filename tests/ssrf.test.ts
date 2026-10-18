// SSRF guard tests — these must reject internal targets before any network call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateIPv4, isBlockedIPv6, isBlockedHostname, safeFetch, SsrfError } from "@/lib/net/ssrf";

test("detects private IPv4 ranges", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "100.64.1.1"]) {
    assert.equal(isPrivateIPv4(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.10"]) {
    assert.equal(isPrivateIPv4(ip), false, ip);
  }
});

test("detects blocked IPv6 forms", () => {
  for (const ip of ["::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254"]) {
    assert.equal(isBlockedIPv6(ip), true, ip);
  }
  assert.equal(isBlockedIPv6("2001:4860:4860::8888"), false);
});

test("detects blocked hostnames", () => {
  for (const h of ["localhost", "metadata.google.internal", "foo.internal", "bar.local", "2130706433"]) {
    assert.equal(isBlockedHostname(h), true, h);
  }
  assert.equal(isBlockedHostname("contoh.id"), false);
});

test("safeFetch rejects localhost and metadata before connecting", async () => {
  for (const url of ["http://localhost/x", "http://127.0.0.1/x", "http://169.254.169.254/latest/meta-data/"]) {
    await assert.rejects(() => safeFetch(url), SsrfError, url);
  }
});

test("safeFetch rejects non-http schemes", async () => {
  await assert.rejects(() => safeFetch("file:///etc/passwd"), SsrfError);
  await assert.rejects(() => safeFetch("gopher://example.com"), SsrfError);
});

test("safeFetch rejects non-standard ports", async () => {
  await assert.rejects(() => safeFetch("http://example.com:22/"), SsrfError);
});

// Regression: URL hostnames wrap IPv6 literals in brackets ("[::1]"). Before the fix these
// fell through to DNS and were rejected only by a resolution failure, not by the SSRF rule.
// safeFetch is the real entry point, so test that.
test("bracketed IPv6 loopback is blocked by the SSRF rule, not by DNS", async () => {
  const { safeFetch, SsrfError } = await import("@/lib/net/ssrf");
  await assert.rejects(() => safeFetch("http://[::1]/x"), (e: Error) => {
    assert.ok(e instanceof SsrfError, `expected SsrfError, got ${e.constructor.name}`);
    assert.match(e.message, /IPv6 blocked|Blocked hostname/i);
    return true;
  });
});

test("bracketed IPv6 unique-local and link-local are blocked", async () => {
  const { safeFetch, SsrfError } = await import("@/lib/net/ssrf");
  for (const u of ["http://[fd00::1]/x", "http://[fe80::1]/x"]) {
    await assert.rejects(() => safeFetch(u), (e: Error) => {
      assert.ok(e instanceof SsrfError, `${u}: expected SsrfError, got ${e.constructor.name}`);
      assert.match(e.message, /blocked/i);
      return true;
    });
  }
});
