// Structural tests: these caught 6 missing PRD pages that no functional test noticed.
// A green build and passing suite said nothing about whether required screens existed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const navSrc = readFileSync(join(ROOT, "src/lib/nav.ts"), "utf8");
const hrefs = [...navSrc.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

function pagePath(href: string): string {
  return href === "/" ? "src/app/page.tsx" : `src/app${href}/page.tsx`;
}

test("every nav link resolves to a real page (no dead sidebar links)", () => {
  const dead = hrefs.filter((h) => !existsSync(join(ROOT, pagePath(h))));
  assert.deepEqual(dead, [], `dead links: ${dead.join(", ")}`);
});

test("nav has no duplicate hrefs", () => {
  const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
  assert.deepEqual(dupes, [], `duplicate hrefs: ${dupes.join(", ")}`);
});

test("PRD Phase 10 screens that must exist are present", () => {
  // Threads Account is covered by /threads; Product Research carries discovery.
  const required = [
    "/integrations",     // Integrations Center
    "/sources/collector",// Source Collector
    "/research",         // Research Scheduler
    "/products/compare", // Product Comparison
    "/affiliate/links",  // Affiliate Link Manager
    "/threads",          // Threads Account
    "/queue",            // Publishing Queue
    "/automation",       // Automation Rules
    "/jobs",             // Execution History
    "/sources/health",   // Source Health
  ];
  const missing = required.filter((r) => !hrefs.includes(r));
  assert.deepEqual(missing, [], `missing required screens: ${missing.join(", ")}`);
});

test("safety controls are reachable from the navigation", () => {
  // If the app can publish, an operator must be able to stop it from the UI.
  assert.ok(hrefs.includes("/automation"), "kill switch page must be in nav");
  const automation = readFileSync(join(ROOT, "src/components/automation/AutomationRulesClient.tsx"), "utf8");
  assert.match(automation, /PAUSE ALL AUTOMATION/, "kill switch button must exist");
});

test("no page calls the pause endpoint without an explicit action name", () => {
  const src = readFileSync(join(ROOT, "src/components/automation/AutomationRulesClient.tsx"), "utf8");
  assert.match(src, /action:\s*"pause_all"/, "must send the named action, not a bare call");
});
