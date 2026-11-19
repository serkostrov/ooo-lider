#!/usr/bin/env node
/**
 * Локальный воркер уведомлений:
 * 1) Telegram getUpdates → telegram-webhook (привязка бота)
 * 2) каждые N сек → notify-dispatch (дубли в Telegram/email)
 *
 *   npm run telegram:poll
 *
 * Рядом должен быть: npm run functions
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DISPATCH_EVERY_MS = 20_000;

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] == null || process.env[m[1]] === "") {
      process.env[m[1]] = m[2];
    }
  }
}

loadEnvFile(resolve(root, ".env"));
loadEnvFile(resolve(root, "supabase/functions/.env"));

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const cronSecret = process.env.NOTIFY_CRON_SECRET?.trim() || "dev-cron-secret";
const fnBase = (process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, "");
const publishable =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const webhookUrl = `${fnBase}/functions/v1/telegram-webhook`;
const dispatchUrl = `${fnBase}/functions/v1/notify-dispatch`;

if (!token) {
  console.error("Нет TELEGRAM_BOT_TOKEN в .env / supabase/functions/.env");
  process.exit(1);
}

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then(async (r) => {
    const j = await r.json();
    if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
    return j.result;
  });

let offset = 0;
let lastDispatch = 0;

async function forward(update) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  const text = await res.text();
  console.log(`→ webhook ${res.status}: ${text.slice(0, 200)}`);
}

async function dispatchPending() {
  const res = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
      ...(publishable ? { apikey: publishable } : {}),
    },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`→ dispatch ${res.status}:`, body.error || body);
    return;
  }
  const sent = body.sent ?? 0;
  const failed = body.failed ?? 0;
  const pending = body.pending ?? 0;
  if (sent || failed || pending) {
    console.log(`→ dispatch ok: pending=${pending} sent=${sent} failed=${failed}`);
  }
}

console.log(`Worker @${process.env.TELEGRAM_BOT_USERNAME || "bot"}`);
console.log(`  webhook:  ${webhookUrl}`);
console.log(`  dispatch: каждые ${DISPATCH_EVERY_MS / 1000}с → ${dispatchUrl}`);

await api("deleteWebhook", { drop_pending_updates: false });
await dispatchPending().catch((e) => console.error("dispatch start:", e.message || e));
lastDispatch = Date.now();

for (;;) {
  try {
    if (Date.now() - lastDispatch >= DISPATCH_EVERY_MS) {
      lastDispatch = Date.now();
      await dispatchPending();
    }

    const updates = await api("getUpdates", {
      offset,
      timeout: 20,
      allowed_updates: ["message"],
    });
    for (const u of updates) {
      offset = u.update_id + 1;
      const text = u.message?.text ?? "";
      console.log(`update ${u.update_id}: ${text}`);
      await forward(u);
    }
  } catch (e) {
    console.error("worker error:", e.message || e);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
