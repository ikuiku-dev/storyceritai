# Shopee Affiliate Connector

## The honest starting point

I cannot verify from this machine whether your Shopee Affiliate account has product-search
or commission API access. Those permissions vary by account and are granted by Shopee.

So the connector is built to be **useful without any API access**, and to be explicit
about what it cannot do until credentials and rights exist.

## Modes

| Mode | When | What works |
|---|---|---|
| MANUAL_IMPORT (default) | No credentials | Paste product URLs, import CSV from official reports, validate links you created |
| OFFICIAL_API | Credentials + confirmed access | Same, plus API-backed search/commission when available |
| DISABLED | User disabled it | Nothing |

Mode is resolved by `resolveMode()` and persisted, so the UI shows reality rather than a
default constant.

## Capability matrix

Shown in the Integrations page. Unsupported entries always carry a reason:

- `shopee.product.search` — needs App ID/Secret **and** confirmed access
- `shopee.commission.report` — needs credentials and an official report

Supported today without credentials:

- `shopee.product.import_url`
- `shopee.product.import_csv`
- `shopee.affiliate.link.store`
- `shopee.affiliate.link.validate`
- `shopee.product.snapshot`

## Link validation rules

| Verdict | Meaning |
|---|---|
| `VALID_AFFILIATE` | Contains a recognised affiliate parameter — stored as-is |
| `PRODUCT_URL_NOT_AFFILIATE` | Normal product URL. **Rejected** as an affiliate link |
| `SHORT_LINK_UNVERIFIED` | shp.ee/shope.ee — destination hidden behind a redirect |
| `NOT_SHOPEE` | Different domain |
| `MALFORMED` | Not a valid http(s) URL |

The application **never** adds, removes or rewrites tracking parameters. Injecting an
affiliate ID would create a link that looks real but pays nobody — worse than an error.

## No invented numbers

- Commission is stored only from a source that reports it
- Missing fields are `null` and shown as "belum diketahui", never `0`
- "Terlaris" / "paling dicari" claims are not made without the data to support them

## Enabling the API

If your account does have access:

1. Put `SHOPEE_APP_ID` and `SHOPEE_APP_SECRET` in `.env` (never in chat)
2. Confirm access in your Shopee Affiliate dashboard
3. Set `SHOPEE_API_CONFIRMED=true`
4. Open Integrations → Shopee → **Test connection**

A successful test proves the host answers. It does **not** prove search or commission
rights — those are checked per feature and reported honestly.
