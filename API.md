# Meditor Share API — v1

The only contract between the macOS app (`addodelgrossi/meditor`) and this
backend. The path prefix `/api/v1/` is versioned: a future `v2` can coexist so
old app builds keep working. Changing the implementation behind this contract
(including a possible future migration off Cloudflare) must not break clients.

Base URL: `https://meditor.dev` (during M1, `https://meditor-share.<account>.workers.dev`).

## POST /api/v1/share

Publish a diagram. No authentication; abuse is bounded by a Cloudflare
rate-limit (M2), size limits, and short TTLs. `Content-Type: application/json`.

Request body:

| Field        | Type   | Rules |
|--------------|--------|-------|
| `version`    | number | Must be `1`. |
| `code`       | string | Mermaid source. 1 byte … 50 KB (UTF-8). |
| `ogImage`    | string | Base64 PNG, 1200×630, rendered by the app. ≤ 500 KB decoded; must carry the PNG magic header. |
| `ttlSeconds` | number | Closed list: `3600` (1h), `86400` (24h), `604800` (7d). |
| `theme`      | string | One of `default`, `neutral`, `dark`, `forest`, `base` (mirrors `MermaidTheme`). |

```json
{ "version": 1, "code": "flowchart TD\n  A-->B",
  "ogImage": "<base64 PNG>", "ttlSeconds": 86400, "theme": "default" }
```

Response `201`:

```json
{ "id": "Xk3mP9qLw2Nf",
  "url": "https://meditor.dev/s/Xk3mP9qLw2Nf",
  "expiresAt": "2026-06-10T18:00:00.000Z",
  "deleteToken": "<32-char secret — store in the Keychain>" }
```

The `id` (12 base58 chars, ~70 bits) and `deleteToken` (32 base58 chars) are
generated server-side; the client never chooses them. Only the SHA-256 of the
delete token is stored.

Errors: `400` invalid JSON / schema / non-PNG image; `413` decoded image over
500 KB; `429` rate-limited (M2).

## GET /s/:id

Returns the viewer HTML page (`200`) with Open Graph / Twitter Card meta tags
(`og:image` → `/s/:id/og.png`) and the Mermaid source, rendered client-side with
mermaid `11.15.0` (the version vendored by the app). `noindex`, view-only.
Unknown or expired ids return a friendly `404` page.

## GET /s/:id/og.png

Serves the stored PNG (`image/png`, `Cache-Control: public, max-age=3600`).
`404` if absent. This is the social-preview image crawlers fetch.

## DELETE /api/v1/share/:id

Unpublish before expiry. Send the delete token as `Authorization: Bearer <token>`.

- `204` — deleted (also returned if already gone; idempotent).
- `401` — no token supplied.
- `403` — token does not match.

## Auto-expiry

Each share is two KV entries (`s:{id}`, `s:{id}:og`) written with
`expirationTtl = ttlSeconds`. KV deletes them natively — no cron, no cleanup.
KV is eventually consistent (~60 s cross-region), so a freshly published link
may 404 briefly far from the write region; the app only surfaces the link after
the `201`.

## Notes / deviations

- **Mermaid delivery:** the viewer loads mermaid `11.15.0` from jsDelivr
  (`cdn.jsdelivr.net/npm/mermaid@11.15.0`) — the same released bytes the app
  vendors. Self-hosting it via Workers Static Assets is a possible follow-up if
  the CDN dependency is unwanted; bundling it into the Worker script risks the
  free-plan size limit.
- **No CORS** on `/api/*`: only the native app posts; browsers from third-party
  sites are intentionally blocked from publishing.
