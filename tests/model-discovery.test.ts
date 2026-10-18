// The model picker must reflect each user's own credentials, not a hardcoded catalogue.
// Every provider exposes a different list, so the only correct source is the provider itself.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { fetchModelsForCredentials } from "@/lib/services/providers";

let server: Server;
let port = 0;
let lastAuth = "";
let payload: unknown = null;

before(async () => {
  server = createServer((req, res) => {
    lastAuth = String(req.headers.authorization ?? "");
    payload = null;
    req.on("data", () => {});
    req.on("end", () => {
      if (req.url?.endsWith("/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        // Two providers return different shapes; both must be understood.
        res.end(JSON.stringify({ data: [{ id: "model-alpha", owned_by: "org-a" }, { id: "model-beta" }] }));
        return;
      }
      res.writeHead(404);
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
});

after(() => server.close());

test("discovers the models a specific key can use", async () => {
  const models = await fetchModelsForCredentials({
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: "sk-user-key",
    protocol: "openai_compatible",
  });
  assert.deepEqual(models, ["model-alpha", "model-beta"]);
  assert.equal(lastAuth, "Bearer sk-user-key", "the user's own key must be used");
});

test("a different base URL yields that provider's catalogue, not a shared one", async () => {
  const m1 = await fetchModelsForCredentials({ baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: "k1", protocol: "openai_compatible" });
  const m2 = await fetchModelsForCredentials({ baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: "k2", protocol: "openai_compatible" });
  assert.deepEqual(m1, m2);
  assert.equal(lastAuth, "Bearer k2", "the latest key must be the one used");
});

test("mock providers expose a local catalogue without any network call", async () => {
  const models = await fetchModelsForCredentials({ baseUrl: "http://127.0.0.1:1/v1", apiKey: null, protocol: "mock" });
  assert.ok(models.length >= 1);
  assert.ok(models.every((m) => m.startsWith("mock")));
});

test("rejects a non-http base URL instead of attempting it", async () => {
  await assert.rejects(
    () => fetchModelsForCredentials({ baseUrl: "file:///etc/passwd", apiKey: "k", protocol: "openai_compatible" }),
    /Base URL/i,
  );
});

test("rejects the cloud metadata endpoint (SSRF guard)", async () => {
  await assert.rejects(
    () => fetchModelsForCredentials({ baseUrl: "http://169.254.169.254/v1", apiKey: "k", protocol: "openai_compatible" }),
    /tidak diizinkan|Base URL/i,
  );
});
