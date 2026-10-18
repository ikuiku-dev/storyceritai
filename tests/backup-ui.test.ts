import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Export and import existed only as API routes, so the user had no button. These assertions
// keep the panel wired to the routes and mounted on the settings page.
const panel = readFileSync("src/components/settings/BackupPanel.tsx", "utf8");
const settings = readFileSync("src/components/settings/SettingsClient.tsx", "utf8");

test("the backup panel is mounted on the settings page", () => {
  assert.match(settings, /import \{ BackupPanel \}/);
  assert.match(settings, /<BackupPanel \/>/);
});

test("the panel calls the real export route for each scope", () => {
  assert.match(panel, /\/api\/export\?scope=\$\{scope\}/);
  assert.match(panel, /doExport\("full"\)/);
  assert.match(panel, /doExport\("content"\)/);
  assert.match(panel, /doExport\("settings"\)/);
});

test("import posts the chosen file to the real import route", () => {
  assert.match(panel, /fetch\("\/api\/import"/);
  assert.match(panel, /method: "POST"/);
});

test("a failed import surfaces the server message instead of claiming success", () => {
  // The success line must be reachable only after res.ok; a bare "berhasil" is a fake claim.
  assert.match(panel, /if \(!res\.ok \|\| !json\.ok\) throw new Error/);
  assert.ok(
    panel.indexOf("berhasil dipulihkan") > panel.indexOf("if (!res.ok"),
    "success message must come after the failure check",
  );
});
