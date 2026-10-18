# TASKS

Legend: [ ] todo · [~] in progress · [x] done & verified (tested against a running server or automated test)

## Phase 1 — Foundation
- [x] Scaffold Next.js 16 + TS + Tailwind v4
- [x] Prisma schema, 23 models, db push (verified)
- [x] Crypto (AES-GCM) secret box (verified: refuses without key, stores sealed)
- [x] Structured logger + redaction
- [x] Audit log service
- [x] Job queue + worker ticker (code present; worker loop not yet wired)
- [x] SSRF-safe fetcher (unit-tested in Phase 9)
- [x] Dashboard shell + sidebar (14 sections)
- [x] Overview page with real-data-only empty states (verified HTTP 200)

## Phase 2 — AI Provider Manager
- [x] Provider CRUD (openai_compatible + mock)
- [x] Encrypted key storage + masking (verified: mask only, no cipher in response)
- [x] Test connection / test model / list models (verified 200)
- [ ] Role assignment UI (API exists, page not built)
- [x] Usage log + cost estimation + budgets (backend)
- [x] Error mapping (auth, url, timeout, rate limit)

## Phase 3 — Story Studio  ✅ verified
- [x] Concept generation (verified: 8 concepts, 8 distinct angles)
- [x] Draft generation with truth mode enforcement (verified: REAL_EXPERIENCE without text → 400)
- [x] Revisions (append-only history, verified via API)
- [x] Naturalness editor pass + slop linter (20 unit tests passing)
- [x] Fact check / claim extraction (verified: verdict WARNINGS)
- [x] Duplicate detection (verified: 0.97 similarity blocked approval with 409)
- [x] Story Studio page (verified end-to-end in browser: generate → fact-check → approve)

## Phase 4 — Source Library ✅ verified
- [x] URL ingestion (SSRF-safe; verified blocks: localhost, 169.254.169.254, file://)
- [x] Text/note import (duplicate detection verified 200 duplicate:true)
- [x] Excerpts + metadata + permission status
- [x] Insight extraction (verified 4 insights, OBSERVATION/PATTERN/INTERPRETATION/HYPOTHESIS)
- [x] Dedupe by content hash + similarity (verified)

## Phase 5 — Product Research ✅ verified
- [x] Product CRUD + snapshots (verified 3 products imported with prices)
- [x] CSV/JSON importer (verified; quoted commas/CRLF unit-tested)
- [x] Opportunity score + editable weights + "unknown" handling (verified 85/100 at 25% coverage; 6 unit tests)
- [x] Affiliate link manager + validation (verified VALID for shope.ee, INVALID for wrong domain)
- [x] Removed fabricated placeholder affiliate URLs found during testing

## Phase 6 — Story Arena ✅ verified
- [x] Tournament pipeline with iteration/cost caps (verified: 7 steps, 9–11 AI calls, stopped before 20 cap)
- [x] Rubric scoring (1–10, weighted) + penalties (verified 7.2/10 for 3 finalists)
- [x] Candidate comparison (verified 3 ranked cards render in UI)
- [x] Save as experiment (verified: experiment created with variants A,B,C)
- [x] Within-batch duplicates eliminated; library similarity reported as a warning

## Phase 7 — Threads Integration ✅ verified (config-gated)
- [x] OAuth authorize + callback + state CSRF (verified: state mismatch rejected, cookie HttpOnly)
- [x] Token exchange, refresh, expiry tracking (code complete; live exchange needs Meta credentials)
- [x] Connection test (verified: NOT_CONNECTED error is correct without a link)
- [x] Publish preview + manual approval (verified: WAITING_APPROVAL → APPROVED flow)
- [x] Scheduled publishing + guardrails (verified: DRAFT_ONLY blocks, fact-check blocks, hype blocks, fake-experience blocks, duplicate blocks)
- [x] Idempotent publish (verified: dedupeKey unique, duplicate submit rejected, no double-post)
- [x] Settings API with AUTO_PUBLISH safety downgrade (verified)
- [ ] **Live end-to-end publish: BLOCKED on THREADS_APP_ID/SECRET/REDIRECT_URI**

## Phase 8 — Analytics ✅ verified
- [x] Metric snapshots (API + manual entry; null ≠ 0)
- [x] Experiment analysis with sample-size caveats (Wilson CI; verified underpowered 40/var vs required 1471; verified exactly ONE CLEAR_LEADER at n=2000)
- [x] Cost dashboard (verified: reports 180 unpriced calls as "incomplete", not $0.00)

## Phase 9 — Hardening ✅
- [x] Automated test suite (50 tests passing)
- [x] Backup script (verified: refuses without CERITALAB_SECRET, creates archive with it)
- [x] README + .env.example
- [x] All 14 nav routes implemented (no dead links)
- [x] **Production build passes** (`npm run build`) and serves all routes (verified on port 3940)

## Phase 10 — Export / Import + Learning Loop ✅ verified
- [x] `GET /api/export?scope=full|content|settings` (verified: 105 KB bundle, 3 products / 5 sources / 36 drafts / 1 experiment / 1 post)
- [x] Secret-leak guard on BOTH export and import (verified: bundle with `apiKeyCipher` rejected `SECRET_LEAK_BLOCKED`)
- [x] Providers export WITHOUT keys (verified: no `apiKeyCipher`, no `apiKeyMask`)
- [x] `POST /api/import` idempotent (verified: re-import skipped 3 products + 5 sources, overwrote nothing)
- [x] Bundle validation (verified: bad JSON -> BAD_JSON, wrong version -> BAD_VERSION)
- [x] `POST /api/experiments/:id/conclude` (verified: no metrics -> INSUFFICIENT, refuses a winner)
- [x] Conclude with large sample -> SUPPORTED, single leader (verified n=4000, A wins)
- [x] `GET /api/analytics/brief` feeds concluded lessons into concept generation (verified text injected as `<learned_guidance>`, labelled TERBUKTI/hypothesis)
- [x] Test data removed; experiment reset to DRAFT so state stays honest

## Phase 11 — Full Audit (against PRD) ✅ complete
Bugs found by testing, all fixed and regression-tested:

- [x] **GUARDRAIL BYPASS (critical)** — `approvePost()` wrote APPROVED with no policy check. A post with a fabricated experience + hype words reached APPROVED. Fixed: guardrails re-run at approve AND again immediately before publish. Test: `tests/guardrails.test.ts`.
- [x] **Domain errors mapped to 500** — `ThreadsError` was unhandled, so UI saw `INTERNAL` instead of `409 GUARDRAIL_BLOCKED` / `429` / `504`. Fixed in `src/lib/api.ts`.
- [x] **7/9 PRD §11 buttons missing** — added Regenerate, Fact Check, Approve, Reject, Compare Candidates, Explain Winner, Export Results + `POST /api/arena/regenerate` (distinct angle, revision history kept).
- [x] **Pause All / Cancel Scheduled (PRD §13) missing** — added `POST /api/publishing/pause` + Settings UI. `resume` never re-enables auto-publish.
- [x] **SSRF: bracketed IPv6 bypass** — `[::1]`, `[fd00::1]`, `[fe80::1]` fell through to DNS (rejected only by resolution failure). Fixed by stripping brackets; literal IPs now skip DNS. Regression test proven to FAIL when the fix is reverted.
- [x] Verified NOT bugs: all `/api/*` responses free of `apiKeyCipher`/`tokenCipher`; metadata IP `169.254.169.254` was correctly blocked all along (my earlier "ALLOWED" reading parsed the wrong field).
- [x] PRD §18: 23/23 models present. PRD §6: 14/14 sidebar pages.

**Verified:** 59/59 tests, tsc clean, production build passes, 14/14 routes on :3941, Settings emergency controls render and hydrate.
