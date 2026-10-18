# TASKS

Legend: [ ] todo · [~] in progress · [x] done & verified

## Phase 1 — Foundation
- [x] Scaffold Next.js 16 + TS + Tailwind v4
- [x] Prisma schema, 22 models, db push migration
- [x] Crypto (AES-GCM) secret box
- [x] Structured logger + redaction
- [x] Audit log service
- [x] Job queue + worker ticker
- [x] SSRF-safe fetcher
- [x] Dashboard shell + sidebar (14 sections)
- [x] Seed synthetic data (clearly labeled)

## Phase 2 — AI Provider Manager
- [x] Provider CRUD (OpenAI-compatible + mock)
- [x] Encrypted key storage + masking + rotation
- [x] Test connection / test model / list models
- [x] Role assignment (8 roles) + fallback provider
- [x] Usage log + cost estimation + budgets
- [x] Error mapping (auth, url, timeout, rate limit)

## Phase 3 — Story Studio
- [x] Concept generation (N distinct angles)
- [x] Draft generation with truth mode enforcement
- [x] Revisions (append-only history)
- [x] Naturalness editor pass + slop linter
- [x] Fact check / claim extraction
- [x] Duplicate detection

## Phase 4 — Source Library
- [x] URL ingestion (SSRF-safe, size/time limits)
- [x] File import (txt/csv/json)
- [x] Excerpts + metadata + permission status
- [x] Insight extraction (fact/interpretation/hypothesis)
- [x] Dedupe by content hash + similarity

## Phase 5 — Product Research
- [x] Product CRUD + snapshots
- [x] CSV/JSON importer
- [x] URL adapter (manual facts)
- [x] Opportunity score + editable weights + "unknown" handling
- [x] Affiliate link manager + validation

## Phase 6 — Story Arena
- [x] Tournament pipeline with iteration/cost caps
- [x] Rubric scoring (1–10, weighted) + penalties
- [x] Candidate comparison
- [x] Save as experiment
- [x] Winner explanation

## Phase 7 — Threads Integration
- [x] OAuth authorize + callback + state CSRF
- [x] Short→long-lived token exchange, refresh, expiry tracking
- [x] Connection test
- [x] Publish preview + manual approval
- [x] Scheduled publishing + guardrails
- [x] Idempotent publish (no duplicates on retry)

## Phase 8 — Analytics
- [x] Metric snapshots (Threads insights + manual)
- [x] Experiment analysis with sample-size caveats
- [x] Cost dashboard
- [x] Learning notes → next experiment

## Phase 9 — Hardening
- [x] 22+ automated tests
- [x] Backup / restore / export
- [x] README, docs, .env.example
