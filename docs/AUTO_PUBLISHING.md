# Auto-Publishing

Publishing automation is **off by default** and cannot be enabled by a single click.

## Four modes

| Mode | Behaviour |
|---|---|
| DRAFT_ONLY | Nothing is published. |
| MANUAL_APPROVAL | Every post needs explicit approval. **Default.** |
| SCHEDULED_APPROVAL | Only approved posts may enter the queue. |
| AUTO_PUBLISH | Enabled only after explicit confirmation and prerequisites. |

## Prerequisites the server enforces

`canEnableAutoPublish()` refuses unless ALL are true:

- A Threads account is connected with a stored token
- A publishing policy row exists
- Daily quota ≥ 1
- Minimum gap ≥ 60 minutes
- Explicit confirmation recorded (`confirmedAt`)
- Kill switch is not active

Sending `autoPublishEnabled: true` without `confirm: true` returns `409 CONFIRM_REQUIRED`.
With confirmation but missing prerequisites it returns `409 PRECONDITIONS_MISSING` listing
exactly what is missing. Both were verified against the running server.

## Conservative defaults (PRD §5.6)

- Max **2** posts per day
- Minimum gap **240 minutes**
- Max **3** queued posts
- Fact-check required
- Valid affiliate link required

These are the application's own limits, not Meta's. Adjust only deliberately.

## Policy engine

Before any publish, `evaluatePublishPolicy()` runs every check and returns **all** failures
at once:

kill switch · fact-check · affiliate link · disclosure · guardrails · text length ·
daily quota · minimum gap · queue depth · budget · account connection

A failure blocks the post. Approval is not the last word — the checks run again immediately
before the request leaves.

## Kill switch

`POST /api/publishing/pause` with `{"action":"pause_all"}`:

- disables auto-publish
- returns scheduled posts to the approval queue
- blocks any new publish **before** a network call
- writes an audit entry

`resume` restores MANUAL_APPROVAL only. It **never** re-enables auto-publish.

## Uncertainty is not retried

If a publish request is sent and the response is lost, the post is marked
`UNKNOWN_OUTCOME`. Automatic retry is refused, because the first request may have
succeeded. A human must check the Threads account first.
