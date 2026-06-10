import { FAVICON_DATA_URI } from "./icons.js";
import type { ShareRecord } from "./schema.js";

const faviconLink = `<link rel="icon" type="image/png" href="${FAVICON_DATA_URI}">`;

// Pinned to the exact Mermaid release vendored by the macOS app
// (Sources/Meditor/Resources/Mermaid, updated via script/update_mermaid.sh).
// Same released bytes -> same render. Bump both together.
const MERMAID_VERSION = "11.15.0";
// jsDelivr's canonical ESM endpoint exposes a usable `export default`. Appending
// /+esm to the .min.js path bundles the UMD build instead, whose default export
// is not the mermaid API — so it must be the bare package@version/+esm form.
const MERMAID_SRC = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/+esm`;

const APP_DOWNLOAD_URL = "https://meditor.dev/";
const ABUSE_EMAIL = "abuse@meditor.dev";

/** Escape a string for safe interpolation into HTML text/attribute context. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Serialize a value for safe embedding inside an inline <script>. */
function toScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function expiresLabel(expiresAt: number, now: number): string {
  const ms = expiresAt - now;
  if (ms <= 0) return "expiring now";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "in under an hour";
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in ${Math.round(hours / 24)} days`;
}

interface ViewerOptions {
  id: string;
  record: ShareRecord;
  baseUrl: string;
  now: number;
}

export function viewerPage({ id, record, baseUrl, now }: ViewerOptions): string {
  const ogImageUrl = `${baseUrl}/s/${id}/og.png`;
  const pageUrl = `${baseUrl}/s/${id}`;
  const expires = expiresLabel(record.expiresAt, now);
  const payload = toScriptJson({ code: record.code, theme: record.theme });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  ${faviconLink}
  <title>Shared diagram · Meditor</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Meditor">
  <meta property="og:title" content="Diagram shared via Meditor">
  <meta property="og:description" content="A Mermaid diagram shared from Meditor for macOS.">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Diagram shared via Meditor">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: -apple-system, system-ui, sans-serif; }
    body { display: flex; flex-direction: column; background: #f6f7f9; color: #111827; }
    #viewport { flex: 1; position: relative; overflow: hidden; cursor: grab; }
    #viewport.dragging { cursor: grabbing; }
    #diagram { position: absolute; left: 50%; top: 50%; transform-origin: 0 0; }
    #diagram svg { display: block; max-width: none !important; }
    #error { display: none; position: absolute; inset: 0; place-content: center; text-align: center; padding: 2rem; color: #b91c1c; }
    footer { display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; align-items: center; justify-content: space-between; padding: .6rem 1rem; font-size: 13px; background: #fff; border-top: 1px solid #e5e7eb; }
    footer a { color: #2563eb; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    .muted { color: #6b7280; }
    button { font: inherit; font-size: 13px; padding: .35rem .7rem; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; }
    button:hover { background: #f3f4f6; }
    @media (prefers-color-scheme: dark) {
      body { background: #0b0e14; color: #e5e7eb; }
      footer { background: #111827; border-top-color: #1f2937; }
      button { background: #1f2937; border-color: #374151; color: #e5e7eb; }
      button:hover { background: #374151; }
    }
  </style>
</head>
<body>
  <div id="viewport"><div id="diagram"></div></div>
  <div id="error">This diagram could not be rendered.</div>
  <footer>
    <span class="muted">Expires ${escapeHtml(expires)}</span>
    <span style="display:flex; gap:.5rem; align-items:center;">
      <button id="copy" type="button">Copy code</button>
      <span>Made with <a href="${escapeHtml(APP_DOWNLOAD_URL)}">Meditor</a> — free for macOS</span>
    </span>
  </footer>
  <script id="payload" type="application/json">${payload}</script>
  <script type="module">
    import mermaid from "${MERMAID_SRC}";
    const data = JSON.parse(document.getElementById("payload").textContent);
    const diagram = document.getElementById("diagram");
    const viewport = document.getElementById("viewport");
    let scale = 1, offsetX = 0, offsetY = 0, w = 0, h = 0;
    const apply = () => {
      diagram.style.width = Math.max(w * scale, 1) + "px";
      diagram.style.height = Math.max(h * scale, 1) + "px";
      diagram.style.transform = "translate(calc(-50% + " + offsetX + "px), calc(-50% + " + offsetY + "px))";
    };
    try {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: data.theme, suppressErrorRendering: true });
      await mermaid.parse(data.code);
      const { svg } = await mermaid.render("shared-diagram", data.code);
      diagram.innerHTML = svg;
      const el = diagram.querySelector("svg");
      el.querySelectorAll("a").forEach((a) => { a.removeAttribute("href"); a.style.pointerEvents = "none"; });
      const box = el.viewBox && el.viewBox.baseVal;
      w = (box && box.width) || el.getBoundingClientRect().width;
      h = (box && box.height) || el.getBoundingClientRect().height;
      el.removeAttribute("width"); el.removeAttribute("height");
      el.style.width = "100%"; el.style.height = "100%";
      el.setAttribute("preserveAspectRatio", "xMidYMid meet");
      const pad = 80;
      scale = Math.min((innerWidth - pad) / w, (innerHeight - pad) / h, 1.15);
      apply();
    } catch {
      document.getElementById("error").style.display = "grid";
    }
    addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) { scale = Math.max(0.08, Math.min(6, scale * (e.deltaY < 0 ? 1.08 : 0.92))); }
      else { offsetX -= e.deltaX; offsetY -= e.deltaY; }
      apply();
    }, { passive: false });
    let dragging = false, px = 0, py = 0;
    viewport.addEventListener("pointerdown", (e) => { dragging = true; px = e.clientX; py = e.clientY; viewport.classList.add("dragging"); });
    addEventListener("pointermove", (e) => { if (!dragging) return; offsetX += e.clientX - px; offsetY += e.clientY - py; px = e.clientX; py = e.clientY; apply(); });
    addEventListener("pointerup", () => { dragging = false; viewport.classList.remove("dragging"); });
    const copy = document.getElementById("copy");
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(data.code);
      copy.textContent = "Copied";
      setTimeout(() => { copy.textContent = "Copy code"; }, 1500);
    });
  </script>
</body>
</html>`;
}

export function expiredPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  ${faviconLink}
  <title>Link expired · Meditor</title>
  <style>
    html, body { margin: 0; height: 100%; font-family: -apple-system, system-ui, sans-serif; }
    body { display: grid; place-content: center; text-align: center; gap: .5rem; padding: 2rem; color: #111827; background: #f6f7f9; }
    a { color: #2563eb; }
    @media (prefers-color-scheme: dark) { body { background: #0b0e14; color: #e5e7eb; } }
  </style>
</head>
<body>
  <h1>This link has expired</h1>
  <p>Shared diagrams are temporary and delete themselves automatically.</p>
  <p>Made with <a href="${escapeHtml(APP_DOWNLOAD_URL)}">Meditor</a> — free for macOS.</p>
  <p style="font-size:12px;color:#6b7280">Report abuse: ${escapeHtml(ABUSE_EMAIL)}</p>
</body>
</html>`;
}
