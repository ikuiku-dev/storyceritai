// Tests for robots.txt evaluation (PRD Phase 2.1).
// Getting this wrong means either crawling where we're forbidden, or refusing everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRobots, isPathAllowed, checkRobots, clearRobotsCache } from "@/lib/connectors/sources/robots";

const group = (agents: string[], disallow: string[], allow: string[] = []) => ({ agents, disallow, allow, crawlDelay: null });

test("parses a simple disallow-all", () => {
  const g = parseRobots("User-agent: *\nDisallow: /");
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].agents, ["*"]);
  assert.deepEqual(g[0].disallow, ["/"]);
});

test("parses crawl-delay into milliseconds", () => {
  const g = parseRobots("User-agent: *\nCrawl-delay: 2");
  assert.equal(g[0].crawlDelay, 2000);
});

test("ignores comments and blank lines", () => {
  const g = parseRobots("# hello\n\nUser-agent: *  # inline\nDisallow: /private\n");
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].disallow, ["/private"]);
});

test("consecutive user-agent lines share one group", () => {
  const g = parseRobots("User-agent: a\nUser-agent: b\nDisallow: /x");
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].agents, ["a", "b"]);
});

test("Disallow: / blocks everything", () => {
  assert.equal(isPathAllowed(group(["*"], ["/"]), "/berita"), false);
});

test("Disallow: (empty) allows everything", () => {
  assert.equal(isPathAllowed(group(["*"], [""]), "/berita"), true);
});

test("wildcards are honoured", () => {
  assert.equal(isPathAllowed(group(["*"], ["/search*"]), "/search?q=1"), false);
  assert.equal(isPathAllowed(group(["*"], ["/search*"]), "/artikel"), true);
});

test("Allow overrides Disallow when more specific", () => {
  // Standard behaviour: the longer pattern wins.
  assert.equal(isPathAllowed(group(["*"], ["/p"], ["/publik"]), "/publik/artikel"), true);
  assert.equal(isPathAllowed(group(["*"], ["/p"], ["/publik"]), "/privat"), false);
});

test("allow and disallow of equal length: allow wins", () => {
  assert.equal(isPathAllowed(group(["*"], ["/abc"], ["/abc"]), "/abc"), true);
});

test("unavailable robots.txt is reported, not assumed permissive", async () => {
  clearRobotsCache();
  const p = await checkRobots("https://contoh-uji.test/artikel", {
    fetchImpl: async () => ({ ok: false, status: 500, text: "" }),
  });
  assert.equal(p.verdict, "UNAVAILABLE");
  assert.match(p.reason, /tidak dapat dipastikan/i);
});

test("missing robots.txt (404) allows but states the reason", async () => {
  clearRobotsCache();
  const p = await checkRobots("https://contoh-404.test/a", {
    fetchImpl: async () => ({ ok: false, status: 404, text: "" }),
  });
  assert.equal(p.verdict, "ALLOWED");
  assert.match(p.reason, /404/);
});

test("an explicit Disallow is a hard stop", async () => {
  clearRobotsCache();
  const p = await checkRobots("https://contoh-blok.test/privat/x", {
    fetchImpl: async () => ({ ok: true, status: 200, text: "User-agent: *\nDisallow: /privat" }),
  });
  assert.equal(p.verdict, "DISALLOWED");
  assert.match(p.reason, /Larangan eksplisit/);
});

test("a specific group for our UA wins over *", async () => {
  clearRobotsCache();
  const p = await checkRobots("https://contoh-ua.test/x", {
    userAgent: "CeritaLabBot",
    fetchImpl: async () => ({
      ok: true, status: 200,
      text: "User-agent: *\nDisallow: /\n\nUser-agent: CeritaLabBot\nAllow: /",
    }),
  });
  assert.equal(p.verdict, "ALLOWED");
});

test("results are cached per origin", async () => {
  clearRobotsCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, status: 200, text: "User-agent: *\nAllow: /" }; };
  await checkRobots("https://contoh-cache.test/a", { fetchImpl });
  await checkRobots("https://contoh-cache.test/b", { fetchImpl });
  assert.equal(calls, 1, "robots.txt must be fetched once per origin, not per URL");
});
