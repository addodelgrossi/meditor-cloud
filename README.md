# meditor-cloud

Backend for [Meditor](https://github.com/addodelgrossi/meditor) diagram sharing
(`meditor.dev`). A Cloudflare Worker + Workers KV: the app publishes a diagram
and gets back a short, view-only, auto-expiring URL with a social preview.

- [`worker/`](worker/) — TypeScript Worker (Hono + Zod) on Workers KV.
- [`script/`](script/) — one-off operational scripts (e.g. the rate-limit rule).
- [`API.md`](API.md) — the versioned `/api/v1` contract between app and backend.

The server never renders Mermaid: it stores the app-rendered PNG for the social
preview and ships the source to the visitor's browser to render as SVG.

## Worker development

```bash
cd worker
npm install
npm test          # vitest + @cloudflare/vitest-pool-workers
npm run lint      # biome
npm run typecheck # tsc --noEmit
npm run dev       # wrangler dev on :8787 (local KV)
```

Pushing to `main` (any change under `worker/**`) runs the tests and deploys the
Worker automatically via GitHub Actions.

## Provisioning from scratch

Everything below is done once, by hand, in the Cloudflare dashboard + CLI. There
is no Terraform — the infrastructure is small and stable, so it is managed
directly.

1. **Cloudflare account** — create one at <https://dash.cloudflare.com>.
2. **Domain** — register `meditor.dev` (Cloudflare Registrar is at-cost) or add
   the zone and point your registrar's name servers at Cloudflare. Skip this for
   a free `*.workers.dev`-only deployment.
3. **Authenticate wrangler** (from `worker/`):
   ```bash
   npx wrangler login
   npx wrangler whoami      # note the Account ID
   ```
4. **Create the KV namespace** and put its id in `worker/wrangler.toml`:
   ```bash
   npx wrangler kv namespace create SHARES
   # → copy the printed id into the SHARES binding in wrangler.toml
   ```
5. **GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions),
   so pushes deploy automatically:
   - `CLOUDFLARE_ACCOUNT_ID` — from `wrangler whoami`.
   - `CLOUDFLARE_API_TOKEN` — a token from the **"Edit Cloudflare Workers"**
     template, scoped to your account and (for custom-domain routes) the
     `meditor.dev` zone.
6. **Custom-domain routes** — once the zone is active, keep the `routes` block in
   `wrangler.toml` enabled. The Worker also stays reachable at
   `meditor-share.<account>.workers.dev`. (Remove the `routes` block if you only
   want the `workers.dev` URL.)
7. **Deploy** — push to `main`, or run `npx wrangler deploy` locally.
8. **Rate limit** — run the script below.

### Rate limit

Protects the public publish endpoint. Create a Cloudflare API token with
**Zone : Zone : Read** and **Zone : Zone WAF : Edit** for `meditor.dev`, then:

```bash
CF_API_TOKEN=xxxxx ./script/setup-rate-limit.sh
```

This installs "block after N POSTs to `/api/v1/share` per window, per IP"
(defaults: 30 requests / 60 s). Override with `REQUESTS`, `PERIOD`, `TIMEOUT`
env vars. On the Free plan, rate-limit rules are limited (one rule, IP-based
counting, restricted periods) — if the API rejects a value, lower `PERIOD` or
set the rule in the dashboard instead.

## Auto-expiry

Each share is two KV entries (`s:{id}`, `s:{id}:og`) written with
`expirationTtl`, so Cloudflare deletes them natively — no cron, no cleanup.
