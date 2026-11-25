import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { notifyConfig } from "../_shared/env.ts";
import { sendEmail } from "../_shared/send.ts";

type Body = {
  request_id?: string;
  to?: string;
  subject?: string;
  text?: string;
  filename?: string;
  content_base64?: string;
  content_type?: string;
};

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  if (!auth.startsWith("Bearer ") || !anonKey || !supabaseUrl) {
    return json({ error: "unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "unauthorized", detail: userErr?.message ?? "нет сессии" }, 401);
  }

  const [{ data: isAdmin, error: adminErr }, { data: isOffice, error: officeErr }] =
    await Promise.all([
      userClient.rpc("is_admin"),
      userClient.rpc("has_role", { p_role: "office" }),
    ]);
  if (isAdmin !== true && isOffice !== true) {
    return json({
      error: "forbidden",
      detail: `нужна роль office/admin; is_admin=${String(isAdmin)} (${adminErr?.message ?? "ok"}), office=${String(isOffice)} (${officeErr?.message ?? "ok"})`,
    }, 403);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const to = (body.to ?? "").trim();
  const filename = (body.filename ?? "").trim();
  const contentBase64 = (body.content_base64 ?? "").trim();
  const requestId = (body.request_id ?? "").trim();
  if (!to || !filename || !contentBase64 || !requestId) {
    return json({ error: "to, filename, content_base64, request_id обязательны" }, 400);
  }
  if (contentBase64.length > 12_000_000) {
    return json({ error: "файл слишком большой" }, 413);
  }

  const { data: canSee, error: seeErr } = await userClient.rpc("can_see_request", {
    p_request_id: requestId,
  });
  // fallback: если RPC нет — проверим через select
  if (seeErr) {
    const { data: row, error } = await userClient
      .from("requests")
      .select("id")
      .eq("id", requestId)
      .maybeSingle();
    if (error || !row) return json({ error: "Нет доступа к заявке" }, 403);
  } else if (canSee !== true) {
    return json({ error: "Нет доступа к заявке" }, 403);
  }

  const cfg = notifyConfig();
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass) {
    return json({
      ok: false,
      error: "SMTP не настроен (SMTP_HOST / SMTP_USER / SMTP_PASS в supabase/functions/.env)",
    }, 503);
  }

  const subject =
    (body.subject ?? "").trim() ||
    `[Лидер] Заявка — бланк`;
  const text =
    (body.text ?? "").trim() ||
    "Во вложении бланк заявки ООО «Лидер».";

  try {
    const bytes = decodeBase64(contentBase64);
    await sendEmail(to, subject, text, {
      attachments: [
        {
          filename,
          content: bytes,
          contentType: body.content_type || undefined,
        },
      ],
    });
    return json({ ok: true, to, filename });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
