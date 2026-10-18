# Troubleshooting

## Tests fail when run together but pass alone

Fixed. Cause: Node runs test files in parallel while they share one SQLite file, so writes
collided. `npm test` now passes `--test-concurrency=1`.

If you add a test that touches the database, give it unique content — two tests using the
same text collide on the fingerprint and one is skipped as a duplicate.

## `CeritaLab` will not start

```
Error: CERITALAB_SECRET must be at least 16 characters
```
Generate one: `openssl rand -base64 32`, put it in `.env`, restart.
Rotating this value makes previously sealed API keys unreadable — re-enter them.

## Prisma client outdated

Symptom: `Property 'x' does not exist on type 'PrismaClient'`.
Run `npx prisma generate`. If the schema changed, `npx prisma db push` first.

## Build fails on `new Date()` during prerender

This project sets `cacheComponents: false` in `next.config.ts` deliberately: every page
reads live SQLite and renders the current time, so there is nothing static to prerender.
See the comment in that file for the full reasoning.

## Provider AI down

`runAI` falls back to the configured fallback provider. If none is configured the error is
surfaced with a `retryable` flag. Check `/providers` → Test connection.

## Shopee connector unavailable

It is designed to degrade to MANUAL_IMPORT rather than fail. Use CSV import or paste a
product URL. Nothing is lost.

## Threads token expired

Open `/threads` → Refresh token. If refresh is refused, click Reauthorize.

## Publication outcome unknown

Status `UNKNOWN_OUTCOME` means the request may have been delivered. **Do not retry
blindly.** Check the Threads account first, then resolve the post manually.

## Job worker restarted mid-run

Jobs carry a unique `dedupeKey` and a lease with a 5-minute TTL. An expired lease is
reclaimable, so a crashed worker does not block the queue permanently.

## Database backup / recovery

```
npm run backup
```
Refuses to run without `CERITALAB_SECRET`. The backup is written outside the repository.
`dev.db` is gitignored on purpose — it contains user data and encrypted key material.
