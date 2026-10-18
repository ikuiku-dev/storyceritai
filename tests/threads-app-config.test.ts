// Threads app credentials live in the database, entered through the web UI, not in .env.
// These tests protect the two properties that matter: the secret is encrypted at rest, and it
// never leaves the server (only a mask is returned).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import {
  saveThreadsAppConfig,
  threadsAppConfigView,
  threadsConfig,
  threadsConfigSource,
} from "@/lib/services/publishing/threads";
import { openSecret } from "@/lib/crypto";

const SECRET = "test-secret-0123456789abcdef0123456789";
const APP_ID = "9988776655443322";
const REDIRECT = "https://example.test/api/threads/callback";

async function clear() {
  await prisma.integrationConnection.deleteMany({ where: { provider: "threads" } });
}

before(clear);
after(clear);

test("saving credentials makes them the active config without an env var", async () => {
  await clear();
  assert.equal(await threadsConfig(), null, "starts unconfigured");
  await saveThreadsAppConfig({ appId: APP_ID, appSecret: SECRET, redirectUri: REDIRECT });
  const cfg = await threadsConfig();
  assert.equal(cfg?.appId, APP_ID);
  assert.equal(cfg?.appSecret, SECRET, "secret round-trips through encryption");
  assert.equal(cfg?.redirectUri, REDIRECT);
  assert.equal(await threadsConfigSource(), "database");
});

test("the secret is encrypted at rest, never stored as plaintext", async () => {
  await clear();
  await saveThreadsAppConfig({ appId: APP_ID, appSecret: SECRET, redirectUri: REDIRECT });
  const row = await prisma.integrationConnection.findUnique({ where: { provider: "threads" } });
  assert.ok(row?.metadataJson, "metadata should be written");
  assert.ok(!row!.metadataJson!.includes(SECRET), "plaintext secret must not appear in the row");
  const meta = JSON.parse(row!.metadataJson!) as { app: { appSecretCipher: string } };
  assert.ok(meta.app.appSecretCipher);
  assert.equal(openSecret(meta.app.appSecretCipher), SECRET, "cipher must decrypt back");
});

test("the settings view returns a mask, never the secret", async () => {
  await clear();
  await saveThreadsAppConfig({ appId: APP_ID, appSecret: SECRET, redirectUri: REDIRECT });
  const view = await threadsAppConfigView();
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes(SECRET), "secret must not be serializable from the view");
  assert.equal(view.hasSecret, true);
  assert.ok(view.appIdMask && view.appIdMask.includes("…"), "app id is masked");
  assert.equal(view.redirectUri, REDIRECT, "redirect URI is not secret and is shown in full");
});

test("re-saving replaces the credentials (a user can correct a typo)", async () => {
  await clear();
  await saveThreadsAppConfig({ appId: APP_ID, appSecret: SECRET, redirectUri: REDIRECT });
  await saveThreadsAppConfig({ appId: "1111222233334444", appSecret: "new-secret-value-here", redirectUri: REDIRECT });
  const cfg = await threadsConfig();
  assert.equal(cfg?.appId, "1111222233334444");
  assert.equal(cfg?.appSecret, "new-secret-value-here");
});

test("a corrupt stored row falls back instead of crashing the integration", async () => {
  await clear();
  await prisma.integrationConnection.create({
    data: { provider: "threads", status: "NOT_CONNECTED", metadataJson: "{not valid json" },
  });
  assert.equal(await threadsConfig(), null, "corrupt metadata must not throw");
  const view = await threadsAppConfigView();
  assert.equal(view.hasSecret, false);
});
