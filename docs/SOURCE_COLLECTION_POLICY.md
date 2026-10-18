# Source Collection Policy

How CeritaLab decides what it may collect. This is enforced in code, not by convention.

## Three signals, no single source of permission

`src/lib/connectors/sources/registry.ts` combines:

1. **robots.txt** — an explicit machine-readable instruction
2. **Adapter type** — RSS/public API are designed for machine reading; a generic page is not
3. **User assertion** — importing data the user has the right to use

| robots.txt | Adapter | Result |
|---|---|---|
| Disallow | any | **Blocked.** Not negotiable, no override. |
| Unreachable | any | **Blocked** (`UNKNOWN`). Cannot prove permission, so we do not crawl. |
| Allow | rss / public_api | Allowed, with crawl-delay honoured |
| Allow | manual_url | Allowed, recorded as weaker evidence |
| n/a | import | Allowed — user-supplied data, marked `USER_IMPORT` |

## Verified behaviour

Live check against real sites, run from this machine:

```
en.wikipedia.org   → ALLOWED     (no rule restricts us)
www.reddit.com     → DISALLOWED  (explicit rule for /r/indonesia/)
example.com        → ALLOWED     (no restrictions stated)
```

Attempting to collect from Reddit through the pipeline stops at the `validate` stage
before any content is stored. This was also confirmed through the UI.

## What we never do

- Bypass a login, CAPTCHA, paywall, or anti-bot protection
- Use private or internal endpoints
- Treat robots.txt as sufficient proof of permission (it is one signal)
- Store whole pages — only metadata, a summary, and a short quote

## Prompt injection

Collected text is **data, never instructions**. `detectInjection()` flags text that tries to
issue commands (ignore-instructions, system-prompt probes, publish commands, secret requests).
Flagged documents are stored with a `PERINGATAN` note and are not treated as authoritative.

## Retention

Fetched documents expire after 90 days (`expiresAt`). User imports never expire on our
schedule because the data belongs to the user. `GET /api/export` exports everything.

## When permission is unclear

The answer is always: import the data yourself, or use an official API. The application
will not crawl a domain whose permission it cannot establish.
