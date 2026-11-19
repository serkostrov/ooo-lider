import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { notifyConfig } from "../_shared/env.ts";
import { sendTelegram } from "../_shared/send.ts";

type TgUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { username?: string };
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const cfg = notifyConfig();
  if (!cfg.telegramToken) return json({ error: "bot not configured" }, 503);

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const text = (update.message?.text ?? "").trim();
  const chatId = update.message?.chat?.id;
  const username = update.message?.from?.username ?? null;
  if (!chatId) return json({ ok: true });

  const start = text.match(/^\/start(?:\s+(.+))?$/i);
  if (!start) {
    await sendTelegram(
      String(chatId),
      "Бот «Лидер». Чтобы привязать аккаунт, нажмите «Привязать Telegram» в настройках системы.",
    ).catch(() => undefined);
    return json({ ok: true });
  }

  const code = (start[1] ?? "").trim();
  if (!code) {
    await sendTelegram(
      String(chatId),
      "Откройте настройки в «Лидер» → Уведомления → Привязать Telegram — там будет ссылка с кодом.",
    ).catch(() => undefined);
    return json({ ok: true });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data, error } = await supabase.rpc("telegram_complete_link", {
    p_code: code,
    p_chat_id: String(chatId),
    p_username: username,
  });

  if (error) {
    await sendTelegram(
      String(chatId),
      `Не удалось привязать: ${error.message}. Запросите новую ссылку в настройках.`,
    ).catch(() => undefined);
    return json({ ok: true, linked: false });
  }

  await sendTelegram(
    String(chatId),
    "Готово: Telegram привязан к аккаунту в «Лидер». Сюда будут приходить уведомления.",
  ).catch(() => undefined);

  return json({ ok: true, linked: true, profile_id: data });
});
