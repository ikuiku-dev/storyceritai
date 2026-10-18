# CeritaLab AI — Implementation Plan

## Phase 0 — Environment Audit (completed)

| Item | Result |
|---|---|
| OS | macOS (Darwin 25.3.0), arm64 |
| CPU / RAM | Apple M4 / 16 GB |
| Disk free | ~60 GB |
| Node.js | v25.2.1 |
| npm | 11.6.2 |
| Python | 3.14.0 (not required by the app) |
| SQLite CLI | 3.51.0 |
| Git | 2.39.5 |
| Docker | 29.8.2 (installed, **not used** — no need for it) |
| Existing project | `/Users/shiina/Projects/kanji-quest` — a working Next.js 16 + Prisma 7 + SQLite app |

### Decisions made from the audit

1. **Reuse the proven local stack** from `kanji-quest`: Next.js 16 (App Router) + React 19 + TypeScript + Prisma 7 + SQLite via `@prisma/adapter-libsql`. This stack is verified to build and run on this machine, which removes the largest setup risk.
2. **No Docker, no Redis, no Postgres server.** The app is local-first. Background jobs use a persistent SQLite-backed job queue with a sequential worker (`Job` table, lease-based) — no external broker needed. Prisma's provider is `sqlite` for the local MVP; a PostgreSQL path is documented but not required.
3. **No external SaaS dependency at runtime.** Everything works offline; AI providers and Threads are optional connectors that show an honest "not connected" state until configured.
4. **Secrets at rest** are encrypted with AES-256-GCM using a key derived from `CERITALAB_SECRET` in `.env` (never in the DB, never in the frontend). If the key is missing the app refuses to start secret-handling operations rather than silently storing plaintext.

### Constraints accepted

- Shopee has **no documented public product-search API** available to ordinary affiliate accounts. The app therefore ships: a URL-entry adapter, CSV/JSON import adapter, and a Shopee Open Platform / affiliate-feed adapter that stays **"not connected"** until the user supplies verified credentials and endpoints. No scraping of login walls or private endpoints. (See `docs/SHOPEE_INTEGRATION.md`.)
- Threads publishing requires a Meta app with the Threads use case. The OAuth flow is fully implemented and verified against the official docs, but publishing can only be *verified end-to-end* once the user supplies `THREADS_APP_ID` / `THREADS_APP_SECRET` and an HTTPS redirect URI. Until then the connector honestly reports "not configured".

## Stack (final)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 + hand-built accessible primitives (no heavy UI lib) |
| DB | SQLite (libsql adapter) via Prisma 7 |
| Validation | Zod (shared schemas between API + UI) |
| Jobs | SQLite `Job` table, lease + retry + backoff, in-process ticker |
| AI | Custom OpenAI-compatible adapter + mock adapter; 8 role assignments |
| Auth | Single-user local mode; secrets gated by `CERITALAB_SECRET` |
| Tests | `node:test` + `tsx` (unit/integration against a temp DB) |

## Phases

- **Phase 1 — Foundation**: scaffold, Prisma schema (22 models), migrations, seed, design system, sidebar shell, audit log, jobs, crypto, SSRF guard.
- **Phase 2 — AI Provider Manager**: CRUD, test connection, test model, list models, masking, usage + cost log, budgets, fallback, role assignment.
- **Phase 3 — Story Studio**: concepts → drafts → revisions, style presets, truth modes, rubrics, naturalness + fact-check + duplicate checks.
- **Phase 4 — Source Library**: URL ingestion (SSRF-safe), file import, excerpts, insights (fact/interpretation/hypothesis), dedupe, citations.
- **Phase 5 — Product Research**: products, snapshots, opportunity score with editable weights, affiliate links + validation.
- **Phase 6 — Story Arena**: tournament (8–12 → 4–6 → 2 versions each → top 3), rubric scoring, penalties, experiments.
- **Phase 7 — Threads Integration**: OAuth, encrypted tokens, refresh, preview, manual approval, schedule queue, idempotent publish.
- **Phase 8 — Analytics**: metric ingestion, experiments, cost dashboard, learning loop.
- **Phase 9 — Hardening**: full test suite, security audit, clean install, backup/restore, docs.

## Assumptions

1. Single operator (one person running it on their own machine). No multi-tenant auth — but a session cookie gate is provided for the dashboard when `AUTH_PASSWORD` is set.
2. Indonesian language is the primary content language; UI is bilingual-friendly but defaults to Indonesian copy for generated text and English/Indonesian labels.
3. "Published" metrics only ever come from the Threads insights API or manual entry by the user. Nothing is estimated.
4. AI scoring is a *filter*, never a prediction of virality — surfaced in the UI.
