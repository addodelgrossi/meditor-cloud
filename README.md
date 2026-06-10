# meditor-cloud

Backend for [Meditor](https://github.com/addodelgrossi/meditor) diagram sharing
(`meditor.dev`). A Cloudflare Worker + Workers KV: the app publishes a diagram
and gets back a short, view-only, auto-expiring URL with a social preview.

- [`worker/`](worker/) — TypeScript Worker (Hono + Zod) on Workers KV.
- `infra/` — Terraform for zone, DNS, KV namespace, rate-limit (M2).
- [`API.md`](API.md) — the versioned `/api/v1` contract between app and backend.

## Worker

```bash
cd worker
npm install
npm test          # vitest + @cloudflare/vitest-pool-workers
npm run lint      # biome
npm run dev       # wrangler dev on :8787 (local KV)
```

The server never renders Mermaid: it stores the app-rendered PNG for the social
preview and ships the source to the visitor's browser to render as SVG.
