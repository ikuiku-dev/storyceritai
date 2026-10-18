// Guards the sidebar scroll behaviour, which was a real usability bug:
// 24 nav items overflowed a 633px sidebar that had no overflow-y, so the lower half of the
// menu could not be reached at all, and every navigation reset the scroll position.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shell = readFileSync(join(process.cwd(), "src/components/shell.tsx"), "utf8");
const nav = readFileSync(join(process.cwd(), "src/lib/nav.ts"), "utf8");

test("the sidebar nav is itself a scroll container", () => {
  assert.match(shell, /<nav[^>]*overflow-y-auto/, "nav needs overflow-y-auto when items exceed viewport");
  assert.match(shell, /min-h-0/, "flex child needs min-h-0 or it refuses to shrink and never scrolls");
});

test("header and footer stay pinned while only the list scrolls", () => {
  assert.match(shell, /shrink-0 py-4/, "logo block must not shrink");
  assert.match(shell, /shrink-0 border-t/, "footer must not shrink");
  assert.match(shell, /h-screen flex-col overflow-hidden/, "aside must clip instead of letting content overflow");
});

test("nav scroll position survives navigation", () => {
  assert.match(shell, /NAV_SCROLL_KEY/, "scroll offset must be persisted");
  assert.match(shell, /sessionStorage\.setItem\(NAV_SCROLL_KEY/, "offset must be written on scroll");
  assert.match(shell, /el\.scrollTop = saved/, "offset must be restored on mount");
});

test("the mobile drawer is height-bounded and scrollable", () => {
  assert.match(shell, /max-h-\[70vh\] overflow-y-auto/, "drawer must scroll rather than run off-screen");
});

test("the menu is long enough that scrolling is genuinely required", () => {
  const count = (nav.match(/href:\s*"/g) ?? []).length;
  assert.ok(count >= 20, `expected a long menu, found ${count} items`);
});
