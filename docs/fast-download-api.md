# Fast Download API reference

Implementation notes for Anna's Archive `/dyn/api/fast_download.json`.
Derived from the upstream source (`allthethings/dyn/views.py`,
`allthethings/utils.py`) — the endpoint itself is self-documenting
(send no params to get its help JSON).

## Request

```
GET /dyn/api/fast_download.json
  ?md5=<32-hex>
  &key=<membership-secret>
  [&path_index=<int>]
  [&domain_index=<int>]
```

- `md5` *(required)* — book MD5.
- `key` *(required)* — membership secret key.
- `path_index` *(optional, default 0)* — collection index when the file lives in multiple collections.
- `domain_index` *(optional, default 0)* — mirror server index (e.g. `0 = Fast Partner Server #1`).

## Response shape

All responses are JSON. Even on 4xx the body is structured — **read the JSON regardless of status**.

### Success — HTTP 200 / 204

```json
{
  "download_url": "https://<mirror>/fast_download/...",
  "account_fast_download_info": {
    "downloads_left": 4,
    "downloads_per_day": 10,
    "recently_downloaded_md5s": ["…", "…"]
  }
}
```

Notes:

- `downloads_left` is the value **before** this request's consumption is recorded. If `md5 ∉ recently_downloaded_md5s`, the actual post-request remaining is `downloads_left − 1`. Repeat downloads (md5 already in the list) don't consume quota.
- `downloads_per_day` includes any bonus downloads granted by membership tier (capped server-side).

### Not a member — HTTP 403

```json
{ "download_url": null, "error": "Not a member" }
```

No `account_fast_download_info`.

### Quota exhausted — HTTP 429

```json
{ "download_url": null, "error": "No downloads left" }
```

**No `account_fast_download_info` is returned** — the server hides quota details in this branch, so clients can't show precise remaining/reset. The best a client can do is explain the window (below) and link to the account page.

### Invalid key — HTTP 401

```json
{ "download_url": null, "error": "Invalid secret key" }
```

### Unparametrized — HTTP 401

A GET with no params returns a self-documenting JSON under key `"///download_url"` listing the accepted parameters.

## Quota window semantics

The server counts downloads inside a **rolling 18-hour window**, not a calendar day:

```python
# allthethings/utils.py — get_account_fast_download_info
cursor.execute(
    "SELECT md5 FROM mariapersist_fast_download_access "
    "WHERE timestamp >= %(timestamp)s AND account_id = %(account_id)s "
    "LIMIT 50000",
    { "timestamp": now_utc - timedelta(hours=18), "account_id": account_id },
)
recently_downloaded_md5s = [...]
downloads_left = downloads_per_day - len(recently_downloaded_md5s)
```

Consequences:

- There is **no fixed reset time**. Each slot frees up 18 h after the download that consumed it.
- Computing a precise "next slot free at" would need the oldest-access timestamp, which the API does **not** expose (only md5s).
- Re-downloading an md5 already in `recently_downloaded_md5s` does **not** count against the quota.

## Client handling in this repo

- `src/lib/client.ts` — `getFastDownloadUrl()` parses both branches, always captures `httpStatus`, and returns `quota?` when `account_fast_download_info` is present.
- `src/utils/validation.ts` — `isQuotaExhaustedError()` detects quota exhaustion via `HTTP 429` or the `"no downloads left"` / `"download limit"` message (belt-and-braces, since a future server-side rename would otherwise go unnoticed).
- `src/utils/display.ts` —
  - `printQuotaInfo()` surfaces `X/Y remaining` after a successful download (green / yellow / red based on remaining).
  - `printQuotaExhausted()` explains the 18 h rolling window and links to the account page plus the free slow-download fallback.
- `src/utils/logger.ts` — `--verbose` emits `[info] [client] quota: X/Y downloads remaining (N used in last 18h)` whenever `account_fast_download_info` is present.
