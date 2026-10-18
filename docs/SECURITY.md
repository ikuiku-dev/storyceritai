# Security

## Principles

- Every external input is untrusted data, never an instruction
- Secrets live in `.env` only, encrypted at rest when stored in the DB
- Fail closed: if permission cannot be established, do nothing

## Verified in this build

| Area | Measure | How verified |
|---|---|---|
| SSRF | Private IPv4/IPv6, metadata IP, non-http schemes blocked | `tests/ssrf.test.ts`; live requests return `blocked: true` |
| SSRF — IPv6 | Bracketed literals `[::1]`, `[fd00::1]`, `[fe80::1]` rejected by rule | Regression test proven to FAIL when the fix is reverted |
| Redirects | Re-validated per hop, max 3, no protocol downgrade | `safeFetch` |
| Prompt injection | Instruction patterns detected and flagged, never executed | `tests/pipeline.test.ts` |
| Secret leak — API | No endpoint returns `apiKeyCipher`/`tokenCipher` | All endpoints checked; all clean |
| Secret leak — export | Recursive `assertNoSecrets` before returning a bundle | Export clean; import **rejects** bundles containing ciphertext |
| Path traversal | Not applicable — no user-controlled file paths | — |
| SQL injection | All access via Prisma parameterised queries | — |
| Unauthorized publishing | Guardrails re-run at approve **and** before publish | `tests/guardrails.test.ts` |
| OAuth CSRF | Random state in HttpOnly, SameSite=Lax cookie, validated on callback | `connection.ts` |
| Token storage | AES-256-GCM sealed; never sent to the client | `crypto.ts` |
| Rate limits | `Retry-After` honoured; no blind retries | `requestWithRetry` |
| Log redaction | Credentials scrubbed before logging | `redact()` in `connectors/base.ts` |

## Bug found and fixed during the audit

`approvePost()` previously wrote `APPROVED` without re-checking policy. A post containing a
fabricated experience and hype words could reach the approval state. Guardrails now run at
approval time and again immediately before the publish request.

## Known limitations

- No authentication layer: this is a single-operator local tool. Do not expose it publicly
  without adding auth and TLS.
- `CERITALAB_SECRET` must be ≥16 characters. Rotating it makes existing sealed secrets
  unreadable — re-enter provider keys after rotation.
- SQLite has no row-level security; file permissions are the boundary.
