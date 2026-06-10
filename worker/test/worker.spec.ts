import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// 1x1 transparent PNG (valid magic header), base64-encoded.
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const validBody = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  code: "flowchart TD\n  A-->B",
  ogImage: PNG_1X1,
  ttlSeconds: 86_400,
  theme: "default",
  ...overrides,
});

const postShare = (body: unknown) =>
  SELF.fetch("https://meditor.dev/api/v1/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/v1/share", () => {
  it("creates a share and returns id, url, expiry and delete token", async () => {
    const res = await postShare(validBody());
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      id: string;
      url: string;
      deleteToken: string;
      expiresAt: string;
    };
    expect(json.id).toMatch(/^[1-9A-HJ-NP-Za-km-z]{12}$/);
    expect(json.url).toBe(`https://meditor.dev/s/${json.id}`);
    expect(json.deleteToken).toHaveLength(32);
    expect(new Date(json.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await SELF.fetch("https://meditor.dev/api/v1/share", {
      method: "POST",
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a ttl outside the allowed list with 400", async () => {
    const res = await postShare(validBody({ ttlSeconds: 120 }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown theme with 400", async () => {
    const res = await postShare(validBody({ theme: "solarized" }));
    expect(res.status).toBe(400);
  });

  it("rejects code over 50 KB with 400", async () => {
    const res = await postShare(validBody({ code: "A".repeat(50 * 1024 + 1) }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-PNG ogImage with 400", async () => {
    const notPng = btoa("hello world this is not a png");
    const res = await postShare(validBody({ ogImage: notPng }));
    expect(res.status).toBe(400);
  });
});

describe("GET /s/:id", () => {
  it("renders the viewer page with social meta and the embedded code", async () => {
    const created = (await (await postShare(validBody())).json()) as { id: string };
    const res = await SELF.fetch(`https://meditor.dev/s/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain(`https://meditor.dev/s/${created.id}/og.png`);
    expect(html).toContain('property="og:image"');
    expect(html).toContain("flowchart TD");
    expect(html).toContain('name="robots" content="noindex"');
    // Must import the canonical ESM endpoint (a usable default export), not the
    // UMD .min.js path which leaves `mermaid` undefined and renders nothing.
    expect(html).toContain("mermaid@11.15.0/+esm");
    expect(html).not.toContain(".min.js/+esm");
    expect(html).toContain('rel="icon"');
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain('id="theme-toggle"');
  });

  it("returns a friendly 404 expired page for unknown ids", async () => {
    const res = await SELF.fetch("https://meditor.dev/s/doesNotExist1");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("expired");
  });
});

describe("GET /s/:id/og.png", () => {
  it("serves the stored PNG with cache headers", async () => {
    const created = (await (await postShare(validBody())).json()) as { id: string };
    const res = await SELF.fetch(`https://meditor.dev/s/${created.id}/og.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("returns 404 for an unknown og image", async () => {
    const res = await SELF.fetch("https://meditor.dev/s/doesNotExist1/og.png");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/share/:id", () => {
  it("rejects a wrong token with 403 and keeps the share", async () => {
    const created = (await (await postShare(validBody())).json()) as { id: string };
    const res = await SELF.fetch(`https://meditor.dev/api/v1/share/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(403);
    expect((await SELF.fetch(`https://meditor.dev/s/${created.id}`)).status).toBe(200);
  });

  it("deletes both keys with the correct token", async () => {
    const created = (await (await postShare(validBody())).json()) as {
      id: string;
      deleteToken: string;
    };
    const res = await SELF.fetch(`https://meditor.dev/api/v1/share/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${created.deleteToken}` },
    });
    expect(res.status).toBe(204);
    expect((await SELF.fetch(`https://meditor.dev/s/${created.id}`)).status).toBe(404);
    expect((await SELF.fetch(`https://meditor.dev/s/${created.id}/og.png`)).status).toBe(404);
  });

  it("requires a token", async () => {
    const created = (await (await postShare(validBody())).json()) as { id: string };
    const res = await SELF.fetch(`https://meditor.dev/api/v1/share/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });
});
