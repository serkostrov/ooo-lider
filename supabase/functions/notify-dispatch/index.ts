import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { notifyConfig } from "../_shared/env.ts";
import { formatMessage, sendEmail, sendTelegram } from "../_shared/send.ts";

type PendingRow = {
  event_key: string;
  kind: string;
  title: string;
  object_id: string;
  object_name: string;
  entity_type: string;
  entity_id: string;
  days: number;
  profile_id: string;
  full_name: string;
  email: string | null;
  telegram_chat_id: string | null;
  channel: "telegram" | "email";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cfg = notifyConfig();
  if (!cfg.enabled) return json({ ok: true, skipped: true, reason: "NOTIFY_ENABLED=false" });

  const auth = req.headers.get("Authorization") ?? "";
  const cron = req.headers.get("x-cron-secret") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  const isService = !!(serviceKey && auth === `Bearer ${serviceKey}`);
  const isCron = !!(cfg.cronSecret && cron === cfg.cronSecret);
  let isAdmin = false;

  if (!isService && !isCron && auth.startsWith("Bearer ") && anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: adminFlag, error: adminErr } = await userClient.rpc("is_admin");
    isAdmin = !adminErr && adminFlag === true;
  }

  if (!isService && !isCron && !isAdmin) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase.rpc("notification_pending_external", {
    p_limit: 80,
  });
  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as PendingRow[];
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const msg = formatMessage(row);
    try {
      if (row.channel === "telegram") {
        if (!row.telegram_chat_id) throw new Error("нет chat_id");
        await sendTelegram(row.telegram_chat_id, msg.text);
      } else {
        if (!row.email) throw new Error("нет email");
        await sendEmail(row.email, msg.subject, msg.text);
      }
      await supabase.rpc("notification_mark_delivered", {
        p_event_key: row.event_key,
        p_profile_id: row.profile_id,
        p_channel: row.channel,
        p_error: null,
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      const errText = e instanceof Error ? e.message : String(e);
      errors.push(`${row.channel}:${row.event_key}: ${errText}`);
      await supabase.rpc("notification_mark_delivered", {
        p_event_key: row.event_key,
        p_profile_id: row.profile_id,
        p_channel: row.channel,
        p_error: errText.slice(0, 500),
      });
    }
  }

  return json({ ok: true, pending: rows.length, sent, failed, errors: errors.slice(0, 10) });
});
