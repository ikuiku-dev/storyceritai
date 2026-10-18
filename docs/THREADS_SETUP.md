# Threads Setup

## Scopes

| Scope | Needed for |
|---|---|
| `threads_basic` | Read own profile |
| `threads_content_publish` | Create and publish posts |
| `threads_manage_insights` | Read post metrics |

Request the minimum. Publishing features stay disabled until the matching scope is granted.

## OAuth flow

```
GET  /api/threads/authorize   → redirect to Meta with state (cookie-bound)
GET  /api/threads/callback    → validate state, exchange code, seal token
GET  /api/threads/connection  → status, account, expiry (never the token)
POST /api/threads/test        → verify the stored token works
POST /api/threads/refresh     → long-lived token exchange
POST /api/threads/disconnect  → wipe stored credentials
```

State is random, HttpOnly, SameSite=Lax, 10-minute lifetime. A mismatch is rejected.

## Token lifetime

Long-lived Threads tokens last ~60 days. Refresh before expiry; if the token is revoked or
cannot be extended, the UI asks you to reauthorize rather than silently failing.

## Publishing, step by step

1. Create a container (`/threads` endpoint) — ID persisted immediately
2. Publish the container (`/threads_publish`)
3. Verify by reading back the published post

If step 2 times out after sending, the post is marked `UNKNOWN_OUTCOME` and automatic retry
is **refused**. A resend could create a duplicate. Check the account, then resolve manually.

## Limits

- Text posts: 500 characters (emoji counted as UTF-8 bytes)
- Rate limits follow Meta's response headers; `Retry-After` is honoured
- Media publishing is not implemented

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `NOT_CONFIGURED` | `.env` missing a value | Add App ID/Secret/Redirect URI, restart |
| `PERMISSION_DENIED` | Scope not granted | Reauthorize, approve the publish scope |
| `RATE_LIMITED` | Too many requests | Wait for `Retry-After`; do not retry in a loop |
| `UNKNOWN_OUTCOME` | Timeout after send | Check the Threads account manually first |
| Token expired | 60-day limit | Click Refresh, or Reauthorize |
