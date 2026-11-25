#!/usr/bin/env node
/**
 * Reverse-proxy for Telegram Bot API.
 * Needed when the VPS blocks api.telegram.org — set TELEGRAM_API_BASE to this URL.
 *
 *   node scripts/telegram-api-proxy.mjs
 *   # then expose with: cloudflared tunnel --url http://127.0.0.1:8787
 */
import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = "https://api.telegram.org";

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, upstream: UPSTREAM }));
    return;
  }

  const target = `${UPSTREAM}${req.url || "/"}`;
  const headers = { ...req.headers, host: "api.telegram.org" };
  delete headers["content-length"];

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body,
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    const outHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (k === "transfer-encoding" || k === "content-encoding") return;
      outHeaders[k] = v;
    });
    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`telegram-api-proxy on http://0.0.0.0:${PORT} → ${UPSTREAM}`);
});
