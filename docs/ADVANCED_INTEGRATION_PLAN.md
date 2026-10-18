# ADVANCED INTEGRATION PLAN

Continues from the stable baseline (commit `e3815ba`): 23 models, 14 routes, 59 tests.
This plan adds four capabilities without replacing existing services.

## Phase 0 — audit findings (actual, not assumed)

| Area | State found | Consequence |
|---|---|---|
| Git | Only the create-next-app commit existed; 126 files uncommitted | Created checkpoint `e3815ba` before touching anything |
| `.gitignore` | Excluded `.env*` but **not `dev.db`** | Fixed first: the DB holds real data + encrypted key ciphertext and was one `git add -A` from being committed |
| DB backup | none | `cp dev.db /tmp/ceritalab-dev.db.backup-<ts>` taken before any migration |
| Baseline health | 59/59 tests, tsc clean | Verified before and after checkpoint |
| Connector abstraction | **absent** — each integration is bespoke | Phase 1 needs a shared contract, not new bespoke code |
| Connector status vocabulary | partial (Threads has NOT_CONFIGURED) | Unified 8-state status needed |
| `robots.txt` | **not implemented at all** | Phase 2 blocker: cannot claim authorized collection without it |
| Job queue | exists (`src/lib/jobs/queue.ts`), lease + dedupeKey | Reuse; do not build a second queue |
| SSRF | exists, hardened this session (IPv6 bracket bug fixed) | Reuse via `safeFetch` |
| Threads | OAuth + publish + idempotency already proven | Extend, don't rewrite |

**Rule going forward:** extend existing services; never create a parallel one.

## Phase 1 — connector contract (`src/lib/connectors/`)

One interface every integration implements:

```
capabilities() → { supported, unsupported: [{name, reason}] }
validateConfig() → { ok, missing[] }
testConnection() → { status, latencyMs, detail }
health() → { status, lastOk, lastError, checkedAt }
```

Status is a closed set, and `CONNECTED` is **only** returned after a successful
authenticated call — never because a URL or key was merely entered:

`NOT_CONFIGURED | NEEDS_AUTHORIZATION | CONNECTED | LIMITED_ACCESS |
RATE_LIMITED | TEMPORARILY_UNAVAILABLE | PERMISSION_DENIED | ERROR`

Shared concerns are implemented once in a base helper, not per connector:
timeout, retry with backoff, error classification (transient / config / permission /
permanent), structured logging with credential redaction, source attribution.

## Phase 2 — authorized source collection

- `robots.txt` fetcher + evaluator (cached per host, honours `Crawl-delay`, UA match),
  used as **one signal among several**, never as the sole grant of permission.
- Source registry persisted (`SourceConnector`), with permission status,
  allowed data types, rate limit, schedule, retention.
- Pipeline: Discover → Fetch → Validate → Extract → Normalize → Deduplicate →
  Classify → Store → Summarize. Each stage observable.
- Store metadata + summary + short quotes, **not** whole pages.
- Insight extraction keeps evidence links and confidence; hypotheses are never facts.

**Hard rules:** no login/CAPTCHA/paywall bypass, no private endpoints, no scraping a
domain whose terms are unclear — fall back to user import.

## Phase 3 — Shopee affiliate

Capability detection first. Adapter priority:
official API → official affiliate reports/feeds → CSV import → manual URL → public page.

**Unknown assumption made explicit:** I cannot verify whether the user's affiliate
account has search/commission API access. Therefore the connector ships in
`MANUAL_IMPORT_MODE` working end-to-end, with API paths implemented against the
documented contract but gated behind credentials. No invented numbers, no random
sub-IDs, no fabricated commission.

## Phase 4 — Threads

Already proven: OAuth state, publish, container resume, `UNKNOWN_AFTER_SEND`.
Add: explicit publishing state machine (`DRAFT → VALIDATING → APPROVED → SCHEDULED →
CLAIMED → PUBLISHING → PUBLISHED`) with the alternative terminal/ambiguous states,
plus metrics that mark unsupported fields `unavailable` rather than `0`.

## Phase 5 — controlled automation

Reuse the existing queue. Add a policy engine that runs **every** check before publish,
a kill switch, and conservative defaults (2/day, 4h gap, 3 queued, one active).
Auto-publish stays OFF by default and requires explicit confirmation.

## Phase 6 — learning loop

Already built (`learning.ts`, `/api/analytics/brief`). Extend with the reports the PRD
lists, each showing evidence and limitations.

## Phases 7-13

Migration is additive (`prisma db push`, no data loss). Tests are mocked — no real
publication in CI. Docs written at the end from what actually works.

## Honest scope boundary

Cannot be completed without external credentials, and will be documented as such:
Shopee API calls, live Threads publish, real AI output quality. Everything testable
with mocks and local fixtures will be built and tested.

---

# Implementation status (measured, not claimed)

## Done and verified

| Item | Evidence |
|---|---|
| Git checkpoint before changes | `e3815ba`, 126 files |
| `dev.db` added to `.gitignore` | was one `git add -A` from committing user data |
| Additive migration | 23 → 33 tables; 194 CostRecord / 39 draft / 25 source unchanged |
| Connector contract | `connectors/{types,base}.ts` — 8 states, error classes, retry only when safe |
| robots.txt evaluator | 14 tests; live check: Wikipedia ALLOWED, **Reddit DISALLOWED** |
| Access decision | 3 signals; `DISALLOWED` is a hard stop; `UNAVAILABLE` fails closed |
| Collection pipeline | injection detector, fingerprint dedupe, quotes only from source text |
| User import | CSV/JSON/Markdown; works with no network; marked `USER_IMPORT` |
| Shopee link validation | normal product URL ≠ affiliate; never adds parameters |
| Publishing state machine | 13 states, `PUBLISHED` immutable, `UNKNOWN_OUTCOME` not auto-retried |
| Policy engine | checks all gates at once; live run found 5 blockers on a real row |
| Kill switch | blocks before any network call; verified against the DB |
| Auto-publish gate | refused twice: no confirm, then no Threads account |

**Test suite: 114/114, stable across 3 consecutive runs. tsc clean. Production build passes. 14/14 pages, 4 new endpoints 200.**

## Bug found and fixed during this phase

`APPROVED → BLOCKED` was not a legal transition, so the policy engine threw instead of
blocking a post that had already been approved and later became invalid (settings
tightened, link stale, account disconnected). Fixed + 2 regression tests.

## Bug found and fixed in the test harness

Tests failed intermittently when run together but passed alone. Cause: Node runs test
files **in parallel** while all of them share one SQLite file, so writes collided.
Fixed with `--test-concurrency=1`, and by making each import test use unique content
(previously identical fixtures collided on fingerprint). Verified stable over 3 runs.

## Still open

- UI pages for Integrations Center, Source Collector, Research Scheduler, Product
  Discovery, Link Manager, Automation Rules, Execution History, Source Health (`/api`
  is ready; the screens are not built).
- Orchestrator not yet exercised over HTTP end-to-end.
- Phase 13 docs (`INTEGRATION_SETUP.md`, `THREADS_SETUP.md`, `SHOPEE_CONNECTOR.md`,
  `SOURCE_COLLECTION_POLICY.md`, `AUTO_PUBLISHING.md`, `SECURITY.md`, `TROUBLESHOOTING.md`).
- Shopee API + live Threads publish remain blocked on credentials; documented as such.
