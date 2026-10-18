import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

// Documentation drifted from the UI once already: the getting-started guide named buttons
// that did not exist ("Test koneksi", "Hubungkan Threads"), and claimed export was possible
// when no button called it. These checks tie the guide to the source it describes.

const guide = readFileSync("docs/user/GETTING_STARTED.md", "utf8");

function source(glob: string[]): string {
  return glob.map((f) => readFileSync(f, "utf8")).join("\n");
}

const providersUi = source([
  "src/components/providers/ProvidersClient.tsx",
]);
const threadsUi = source(["src/components/threads/ThreadsClient.tsx"]);

test("button names in the guide exist in the components", () => {
  // Exact strings the user must click.
  for (const label of ["Test Connection", "Tambah provider", "Aktifkan"]) {
    assert.ok(providersUi.includes(label), `providers UI is missing "${label}"`);
    assert.ok(guide.includes(label), `guide should name the real button "${label}"`);
  }
  for (const label of ["Simpan kredensial", "Siapkan postingan"]) {
    assert.ok(threadsUi.includes(label), `threads UI is missing "${label}"`);
    assert.ok(guide.includes(label), `guide should name the real button "${label}"`);
  }
});

test("the guide no longer names buttons that do not exist", () => {
  for (const stale of ["Hubungkan Threads", "Test koneksi"]) {
    assert.ok(!guide.includes(stale), `guide still says "${stale}"`);
  }
});

test("every route the guide sends the user to actually exists", () => {
  const routes = [...guide.matchAll(/`(\/[a-z/-]*)`/g)].map((m) => m[1]);
  assert.ok(routes.length > 5, "expected the guide to reference routes");
  for (const r of new Set(routes)) {
    const dir = r === "/" ? "src/app" : `src/app${r}`;
    assert.ok(
      existsSync(`${dir}/page.tsx`),
      `guide references ${r} but ${dir}/page.tsx does not exist`,
    );
  }
});

test("the guide admits the limitations that are real", () => {
  // A user guide that hides these would be the same false confidence the audit removed.
  for (const claim of ["Penjadwalan tidak berjalan otomatis", "Komisi tidak bisa diverifikasi"]) {
    assert.ok(guide.includes(claim), `guide must state: ${claim}`);
  }
});

test("audit docs exist and are not empty placeholders", () => {
  const dir = "docs/audit";
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const body = readFileSync(`${dir}/${f}`, "utf8");
    assert.ok(body.length > 500, `${f} looks like an empty placeholder`);
  }
});
