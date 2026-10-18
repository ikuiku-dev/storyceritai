# Integration Setup

Each integration states plainly what works today and what is blocked.

## 1. AI Provider

**Status: works with mock, real keys not yet entered.**

1. Open `/providers`
2. Add a provider: name, base URL, model, API key
3. Key is encrypted with `CERITALAB_SECRET` and never returned (only a mask like `sk-…3f9a`)
4. Map roles (writer, critic, fact-checker…) to models

Supported protocols: `mock`, OpenAI-compatible (OpenAI, Ollama `http://localhost:11434/v1`,
LM Studio `http://localhost:1234/v1`).

## 2. Threads (Meta)

**Status: code complete and tested against a local fake API. Live publish BLOCKED — needs your credentials.**

1. Create an app at `developers.facebook.com`
2. Add the Threads use case, request scopes:
   `threads_basic`, `threads_content_publish`, `threads_manage_insights`
3. Set an HTTPS redirect URI
4. Put in `.env` (never in chat):
   ```
   THREADS_APP_ID=...
   THREADS_APP_SECRET=...
   THREADS_REDIRECT_URI=https://your-domain/api/threads/callback
   ```
5. Restart, open `/threads`, click **Connect**
6. Verify with **Test connection**, then **Test permissions**

What is proven locally: OAuth state validation, container creation, container resume after
failure, idempotent publish (second call is a no-op), and `UNKNOWN_AFTER_SEND` handling on
timeout. What is **not** proven: a real post reaching a real account.

## 3. Shopee Affiliate

**Status: MANUAL_IMPORT works fully. API mode blocked on credentials + account rights.**

See `SHOPEE_CONNECTOR.md`. Without credentials you can still paste product URLs, import CSV
from official reports, and validate affiliate links.

## 4. Source Collector

**Status: works, no credentials needed.**

- RSS / public API: enter a feed URL, **Test access** checks robots.txt first
- Import: paste JSON/CSV/Markdown at `/sources/collector`

Live result: Wikipedia allowed, **Reddit blocked by its own robots.txt**.

## Testing publishing without posting publicly

`tests/publish-idempotency.test.ts` runs a local fake Threads API on `127.0.0.1:4599` via
`THREADS_API_BASE`. No real content is ever published by the test suite.

## What is not implemented

- Image / video / carousel publish (text only)
- Reply and mention reading
- Reply-level insights
- Instagram cross-posting
