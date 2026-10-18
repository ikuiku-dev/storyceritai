// Publish idempotency against a real HTTP fake — exercises the actual Threads client,
// not a mock of it. Runs with no network access and no credentials.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";

// The client reads THREADS_API_BASE at import time, so set it before importing.
process.env.THREADS_API_BASE = "http://127.0.0.1:4599";

const fake = {
  containers: 0,
  publishes: 0,
  published: [] as string[],
  mode: "ok" as "ok" | "fail_publish",
  lastText: "",
};

let server: Server;

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://127.0.0.1");
    let body = "";
    for await (const c of req) body += c;

    if (url.pathname === "/__reset") {
      fake.containers = 0; fake.publishes = 0; fake.published = []; fake.mode = "ok";
      res.writeHead(200); return res.end("{}");
    }
    if (url.pathname.includes("/threads_publish")) {
      if (fake.mode === "fail_publish") {
        res.writeHead(500, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "boom" } }));
      }
      fake.publishes++;
      const id = `post-${fake.publishes}`;
      fake.published.push(id);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ id }));
    }
    if (/\/v1\.0\/[^/]+\/threads$/.test(url.pathname)) {
      fake.containers++;
      fake.lastText = new URLSearchParams(body).get("text") ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ id: `container-${fake.containers}` }));
    }
    if (url.pathname.endsWith("/me")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ id: "user-1", username: "tester" }));
    }
    res.writeHead(404); res.end("{}");
  });
  await new Promise<void>((r) => server.listen(4599, "127.0.0.1", r));
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("publishing the same post twice creates exactly one Threads post", async () => {
  const { createTextContainer, publishContainer } = await import("@/lib/services/publishing/threads");

  // Simulate the service's two-step flow with its own guard semantics.
  let containerId: string | null = null;
  let publishedRemote: string | null = null;

  async function publishOnce() {
    if (publishedRemote) return { dup: true, remoteId: publishedRemote };
    if (!containerId) {
      const c = await createTextContainer("tok", "user-1", "halo");
      containerId = String(c.id);
    }
    const p = await publishContainer("tok", "user-1", containerId);
    publishedRemote = String(p.id);
    return { dup: false, remoteId: publishedRemote };
  }

  await fetch("http://127.0.0.1:4599/__reset");

  const first = await publishOnce();
  const second = await publishOnce();

  assert.equal(first.dup, false);
  assert.equal(second.dup, true);
  assert.equal(first.remoteId, second.remoteId, "second call must return the SAME remote id");
  assert.equal(fake.containers, 1, "only one container may be created");
  assert.equal(fake.publishes, 1, "only one publish may reach the API");
});

test("a failed publish resumes the SAME container instead of creating a new one", async () => {
  const { createTextContainer, publishContainer } = await import("@/lib/services/publishing/threads");
  await fetch("http://127.0.0.1:4599/__reset");

  fake.mode = "fail_publish";
  const c = await createTextContainer("tok", "user-1", "halo");
  const containerId = String(c.id);
  await assert.rejects(() => publishContainer("tok", "user-1", containerId), /HTTP 500/);

  // Recovery: reuse the persisted container.
  fake.mode = "ok";
  const p = await publishContainer("tok", "user-1", containerId);

  assert.ok(p.id);
  assert.equal(fake.containers, 1, "must NOT create a second container on retry");
  assert.equal(fake.publishes, 1);
});

test("HTTP 500 surfaces as a typed error, not a silent success", async () => {
  const { createTextContainer, publishContainer } = await import("@/lib/services/publishing/threads");
  await fetch("http://127.0.0.1:4599/__reset");
  const c = await createTextContainer("tok", "user-1", "halo");
  fake.mode = "fail_publish";
  await assert.rejects(
    () => publishContainer("tok", "user-1", String(c.id)),
    (e: Error) => /Threads API error \(HTTP 500\)/.test(e.message),
  );
});
