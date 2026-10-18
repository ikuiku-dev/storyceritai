// Regression tests for the AI adapter's handling of real, imperfect providers.
// Both bugs here were found by testing against a live OpenAI-compatible endpoint whose
// account had run out of credit — a situation unit tests with mocks never produce.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { openaiAdapter } from "@/lib/services/ai/openai";

let server: Server;
let port = 0;
let seenBodies: Record<string, unknown>[] = [];
let mode: "reject-json" | "ok" = "reject-json";

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      seenBodies.push(parsed);

      // Mimics a provider that cannot convert response_format (real message from oneapi.id).
      if (mode === "reject-json" && parsed.response_format) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "response_format cannot be converted to another protocol" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
});

after(() => { server.close(); });

const cfg = () => ({
  baseUrl: `http://127.0.0.1:${port}/v1`,
  apiKey: "test-key",
  model: "test-model",
  timeoutMs: 5000,
  maxOutputTokens: 100,
  temperature: null,
});

test("a provider rejecting response_format is retried without it, not failed", async () => {
  seenBodies = [];
  mode = "reject-json";
  const r = await openaiAdapter.complete({ model: "test-model", messages: [{ role: "user", content: "hi" }], jsonMode: true } as never, cfg() as never);
  assert.equal(r.text, '{"ok":true}');
  assert.equal(seenBodies.length, 2, "should have retried exactly once");
  assert.ok(seenBodies[0].response_format, "first attempt asked for JSON");
  assert.equal(seenBodies[1].response_format, undefined, "retry must omit response_format");
  assert.equal(seenBodies[1].authorization, undefined);
});

test("the capability is remembered, so later calls skip the doomed first attempt", async () => {
  seenBodies = [];
  mode = "reject-json";
  await openaiAdapter.complete({ model: "test-model", messages: [{ role: "user", content: "again" }], jsonMode: true } as never, cfg() as never);
  assert.equal(seenBodies.length, 1, "second call must not re-attempt response_format");
  assert.equal(seenBodies[0].response_format, undefined);
});

test("a plain 400 unrelated to response_format is NOT swallowed", async () => {
  const bad = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "model does not exist" } }));
    });
  });
  await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
  const p2 = (bad.address() as { port: number }).port;
  try {
    await assert.rejects(
      () => openaiAdapter.complete(
        { model: "nope", messages: [{ role: "user", content: "hi" }], jsonMode: true } as never,
        { ...cfg(), baseUrl: `http://127.0.0.1:${p2}/v1` } as never,
      ),
      /invalid_request|not exist|BAD_REQUEST/i,
    );
  } finally {
    bad.close();
  }
});

test("the Authorization header is sent correctly (guards the broken template literal)", async () => {
  seenBodies = [];
  mode = "ok";
  let auth = "";
  const probe = createServer((req, res) => {
    auth = String(req.headers.authorization ?? "");
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "x" } }] }));
    });
  });
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const p3 = (probe.address() as { port: number }).port;
  try {
    await openaiAdapter.complete(
      { model: "m", messages: [{ role: "user", content: "hi" }] } as never,
      { ...cfg(), baseUrl: `http://127.0.0.1:${p3}/v1` } as never,
    );
    assert.equal(auth, "Bearer test-key", "header must be a well-formed bearer token");
  } finally {
    probe.close();
  }
});
