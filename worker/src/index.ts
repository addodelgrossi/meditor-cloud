import { Hono } from "hono";
import { PngDecodeError, decodeBase64Png, sha256, timingSafeEqual } from "./crypto.js";
import { DELETE_TOKEN_LENGTH, SHARE_ID_LENGTH, generateId } from "./ids.js";
import { expiredPage, viewerPage } from "./pages.js";
import { MAX_OG_IMAGE_BYTES, type ShareRecord, shareRequestSchema } from "./schema.js";

interface Env {
  SHARES: KVNamespace;
}

const recordKey = (id: string): string => `s:${id}`;
const ogKey = (id: string): string => `s:${id}:og`;

const app = new Hono<{ Bindings: Env }>();

app.post("/api/v1/share", async (c) => {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const parsed = shareRequestSchema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
  }
  const body = parsed.data;

  let png: Uint8Array;
  try {
    png = decodeBase64Png(body.ogImage);
  } catch (error) {
    if (error instanceof PngDecodeError) return c.json({ error: error.message }, 400);
    throw error;
  }
  if (png.byteLength > MAX_OG_IMAGE_BYTES) {
    return c.json({ error: `ogImage exceeds ${MAX_OG_IMAGE_BYTES} bytes` }, 413);
  }

  const id = generateId(SHARE_ID_LENGTH);
  const deleteToken = generateId(DELETE_TOKEN_LENGTH);
  const now = Date.now();
  const expiresAt = now + body.ttlSeconds * 1000;

  const record: ShareRecord = {
    code: body.code,
    theme: body.theme,
    createdAt: now,
    expiresAt,
    deleteTokenHash: await sha256(deleteToken),
  };

  await c.env.SHARES.put(recordKey(id), JSON.stringify(record), {
    expirationTtl: body.ttlSeconds,
  });
  await c.env.SHARES.put(ogKey(id), png, { expirationTtl: body.ttlSeconds });

  const origin = new URL(c.req.url).origin;
  return c.json(
    {
      id,
      url: `${origin}/s/${id}`,
      expiresAt: new Date(expiresAt).toISOString(),
      deleteToken,
    },
    201,
  );
});

app.get("/s/:id", async (c) => {
  const id = c.req.param("id");
  const record = await c.env.SHARES.get<ShareRecord>(recordKey(id), "json");
  if (!record) return c.html(expiredPage(), 404);
  const baseUrl = new URL(c.req.url).origin;
  return c.html(viewerPage({ id, record, baseUrl, now: Date.now() }));
});

app.get("/s/:id/og.png", async (c) => {
  const id = c.req.param("id");
  const png = await c.env.SHARES.get(ogKey(id), "arrayBuffer");
  if (!png) return c.notFound();
  return c.body(png, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=3600",
  });
});

app.delete("/api/v1/share/:id", async (c) => {
  const id = c.req.param("id");
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return c.json({ error: "missing delete token" }, 401);

  const record = await c.env.SHARES.get<ShareRecord>(recordKey(id), "json");
  if (!record) return c.body(null, 204); // already gone — idempotent

  const tokenHash = await sha256(token);
  if (!timingSafeEqual(tokenHash, record.deleteTokenHash)) {
    return c.json({ error: "invalid delete token" }, 403);
  }

  await c.env.SHARES.delete(recordKey(id));
  await c.env.SHARES.delete(ogKey(id));
  return c.body(null, 204);
});

app.get("/", (c) => c.text("Meditor share service. See https://meditor.dev"));

export default app;
