#!/usr/bin/env node
/**
 * Прод-воркер Telegram (когда VPS не достучится до api.telegram.org):
 * - getUpdates → привязка /start CODE + ответ из этой машины
 * - раз в N сек шлёт pending-уведомления
 *
 * Нужен файл supabase/functions/.env.prod.local (не коммитить):
 *   SUPABASE_URL=https://lider-supabase-….sslip.io
 *   SUPABASE_SERVICE_ROLE_KEY=…
 *   TELEGRAM_BOT_TOKEN=…
 *   TELEGRAM_BOT_USERNAME=LiderOOO_bot
 *
 *   node scripts/telegram-prod-worker.mjs
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
loadEnvFile(resolve(root, "supabase/functions/.env.prod.local"));

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!token) {
  console.error("Нет TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) {
  console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в supabase/functions/.env.prod.local");
  process.exit(1);
}

const tgApi = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then(async (r) => {
    const j = await r.json();
    if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
    return j.result;
  });

const sbHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function sbRpc(name, args) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: sbHeaders,
    body: JSON.stringify(args ?? {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || res.statusText;
    throw new Error(`${name}: ${msg}`);
  }
  return data;
}

async function sendTg(chatId, text) {
  await tgApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

function formatMessage(row) {
  const appUrl = (process.env.APP_URL || "https://lider-11645f-89-111-154-253.sslip.io").replace(/\/$/, "");
  if (row.kind === "password_reset" || row.entity_type === "profile") {
    return { text: row.title, link: `${appUrl}/directories?tab=employees` };
  }
  const link =
    row.entity_type === "request"
      ? `${appUrl}/requests/${row.entity_id}`
      : `${appUrl}/objects/${row.object_id}/stages/${row.entity_id}`;
  const daysLabel =
    row.days < 0
      ? `просрочено на ${Math.abs(row.days)} дн.`
      : row.days === 0
        ? "сегодня"
        : `через ${row.days} дн.`;
  return {
    text: [row.title, `Объект: ${row.object_name}`, `Срок: ${daysLabel}`].join("\n"),
    link,
  };
}

async function handleUpdate(u) {
  const text = (u.message?.text ?? "").trim();
  const chatId = u.message?.chat?.id;
  const username = u.message?.from?.username ?? null;
  if (!chatId) return;

  const start = text.match(/^\/start(?:\s+(.+))?$/i);
  if (!start) {
    await sendTg(
      chatId,
      "Бот «Лидер». Чтобы привязать аккаунт, нажмите «Привязать Telegram» в настройках системы.",
    );
    return;
  }

  const code = (start[1] ?? "").trim();
  if (!code) {
    await sendTg(
      chatId,
      "Откройте настройки в «Лидер» → Уведомления → Привязать Telegram — там будет ссылка с кодом.",
    );
    return;
  }

  try {
    await sbRpc("telegram_complete_link", {
      p_code: code,
      p_chat_id: String(chatId),
      p_username: username,
    });
    await sendTg(chatId, "Готово: Telegram привязан к аккаунту в «Лидер». Сюда будут приходить уведомления.");
    console.log(`linked chat=${chatId} user=@${username || "-"}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendTg(chatId, `Не удалось привязать: ${msg}. Запросите новую ссылку в настройках.`);
    console.error("link failed:", msg);
  }
}

async function dispatchPending() {
  const rows = (await sbRpc("notification_pending_external", { p_limit: 80 })) ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return;

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.channel !== "telegram") continue; // email остаётся на edge/SMTP
    try {
      if (!row.telegram_chat_id) throw new Error("нет chat_id");
      const msg = formatMessage(row);
      await tgApi("sendMessage", {
        chat_id: row.telegram_chat_id,
        text: msg.text,
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть", url: msg.link }]],
        },
      });
      await sbRpc("notification_mark_delivered", {
        p_event_key: row.event_key,
        p_profile_id: row.profile_id,
        p_channel: row.channel,
        p_error: null,
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      const errText = e instanceof Error ? e.message : String(e);
      await sbRpc("notification_mark_delivered", {
        p_event_key: row.event_key,
        p_profile_id: row.profile_id,
        p_channel: row.channel,
        p_error: errText.slice(0, 500),
      }).catch(() => {});
      console.error("dispatch fail:", errText);
    }
  }
  if (sent || failed) console.log(`dispatch telegram: sent=${sent} failed=${failed}`);
}

console.log(`Prod Telegram worker @${process.env.TELEGRAM_BOT_USERNAME || "bot"}`);
console.log(`  supabase: ${supabaseUrl}`);
console.log(`  mode: getUpdates (webhook will be cleared)`);

await tgApi("deleteWebhook", { drop_pending_updates: false });
await dispatchPending().catch((e) => console.error("dispatch start:", e.message || e));
let offset = 0;
let lastDispatch = Date.now();

for (;;) {
  try {
    if (Date.now() - lastDispatch >= DISPATCH_EVERY_MS) {
      lastDispatch = Date.now();
      await dispatchPending();
    }
    const updates = await tgApi("getUpdates", {
      offset,
      timeout: 20,
      allowed_updates: ["message"],
    });
    for (const u of updates) {
      offset = u.update_id + 1;
      console.log(`update ${u.update_id}: ${u.message?.text ?? ""}`);
      await handleUpdate(u);
    }
  } catch (e) {
    console.error("worker error:", e.message || e);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
