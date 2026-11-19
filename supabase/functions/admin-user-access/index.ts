import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { notifyConfig } from "../_shared/env.ts";
import { sendEmail } from "../_shared/send.ts";

type Action = "issue_access" | "reset_password" | "request_reset";

type Body = {
  action?: Action;
  profile_id?: string;
  email?: string;
};

const PASS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASS_ALPHABET[bytes[i]! % PASS_ALPHABET.length];
  }
  return out;
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

async function requireAdmin(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
): Promise<{ userId: string; profileId: string } | Response> {
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: adminFlag, error: adminErr } = await userClient.rpc("is_admin");
  if (adminErr || adminFlag !== true) return json({ error: "forbidden" }, 403);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

  const { data: profile, error: pErr } = await userClient
    .from("profiles")
    .select("id")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr || !profile) return json({ error: "profile_not_found" }, 403);

  return { userId: userData.user.id, profileId: profile.id as string };
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  // GoTrue admin filter by email
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(
    `${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${key}`, apikey: key } },
  );
  if (res.ok) {
    const body = await res.json().catch(() => null);
    const users = (body?.users ?? body?.user ? [body.user] : []) as Array<{
      id: string;
      email?: string;
    }>;
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length === 1) return users[0]!;
  }

  // fallback: scan first pages (малый штат CRM)
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return { id: hit.id, email: hit.email };
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<{ userId: string; created: boolean }> {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!created.error && created.data.user) {
    return { userId: created.data.user.id, created: true };
  }

  const msg = (created.error?.message ?? "").toLowerCase();
  const exists =
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists") ||
    created.error?.status === 422;

  if (!exists) {
    throw new Error(created.error?.message ?? "createUser failed");
  }

  const existing = await findAuthUserByEmail(admin, email);
  if (!existing) throw new Error("Пользователь с таким email уже есть, но не найден");

  const upd = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (upd.error) throw new Error(upd.error.message);
  return { userId: existing.id, created: false };
}

async function sendCredentialsEmail(
  to: string,
  fullName: string,
  password: string,
  kind: "issue" | "reset",
): Promise<{ emailed: boolean; emailError?: string }> {
  const { appUrl } = notifyConfig();
  const subject =
    kind === "issue"
      ? "[Лидер] Доступ в систему"
      : "[Лидер] Новый пароль";
  const text = [
    `Здравствуйте${fullName ? `, ${fullName}` : ""}!`,
    "",
    kind === "issue"
      ? "Вам выдан доступ в систему «Лидер»."
      : "Администратор выпустил новый пароль для входа в «Лидер».",
    "",
    `Email: ${to}`,
    `Пароль: ${password}`,
    "",
    `Вход: ${appUrl}/login`,
    "",
    "Сохраните пароль. При необходимости запросите сброс на странице входа.",
  ].join("\n");

  try {
    await sendEmail(to, subject, text);
    return { emailed: true };
  } catch (e) {
    return { emailed: false, emailError: e instanceof Error ? e.message : String(e) };
  }
}

async function notifyAdminsAboutReset(
  admin: SupabaseClient,
  employeeName: string,
  employeeEmail: string,
): Promise<void> {
  const { appUrl } = notifyConfig();
  // Явный FK: после profile_roles PostgREST видит два пути profiles↔roles.
  const { data: admins } = await admin
    .from("profiles")
    .select("email, full_name, roles!profiles_role_code_fkey(is_admin)")
    .is("deleted_at", null)
    .eq("is_active", true);

  const subject = `[Лидер] Запрос сброса пароля: ${employeeName || employeeEmail}`;
  const text = [
    `Сотрудник запросил сброс пароля.`,
    `ФИО: ${employeeName || "—"}`,
    `Email: ${employeeEmail}`,
    "",
    `Откройте справочник сотрудников и нажмите «Сбросить пароль»:`,
    `${appUrl}/directories?tab=employees`,
  ].join("\n");

  for (const a of admins ?? []) {
    const role = a.roles as { is_admin?: boolean } | { is_admin?: boolean }[] | null;
    const isAdmin = Array.isArray(role) ? role.some((r) => r.is_admin) : !!role?.is_admin;
    if (!isAdmin) continue;
    const to = (a.email as string | null)?.trim();
    if (!to) continue;
    try {
      await sendEmail(to, subject, text);
    } catch {
      // письмо админу — best effort
    }
  }
}

async function markResetRequestsDone(
  admin: SupabaseClient,
  profileId: string,
  resolvedBy: string,
) {
  const { error } = await admin
    .from("password_reset_requests")
    .update({
      status: "done",
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq("profile_id", profileId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`Не удалось закрыть заявку на сброс: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "server_misconfigured" }, 500);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = body.action;
  if (!action) return json({ error: "action_required" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // --- публичная заявка «забыли пароль» ---
  if (action === "request_reset") {
    const email = normalizeEmail(body.email ?? "");
    if (!email || !email.includes("@")) {
      return json({ error: "Укажите корректный email" }, 400);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, email, user_id, is_active")
      .is("deleted_at", null)
      .ilike("email", email)
      .maybeSingle();

    // не раскрываем, есть ли email в системе
    if (!profile?.user_id || !profile.is_active) {
      return json({
        ok: true,
        message:
          "Если этот email есть в системе, администратор получит заявку и пришлёт новый пароль.",
      });
    }

    const { data: existing } = await admin
      .from("password_reset_requests")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await admin.from("password_reset_requests").insert({
        profile_id: profile.id,
        email: profile.email ?? email,
        status: "pending",
      });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    await notifyAdminsAboutReset(
      admin,
      (profile.full_name as string) ?? "",
      (profile.email as string) ?? email,
    );

    return json({
      ok: true,
      message:
        "Заявка отправлена администратору. Новый пароль придёт на email после перевыпуска.",
    });
  }

  // --- админские действия ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const adminUser = await requireAdmin(supabaseUrl, anonKey, authHeader);
  if (adminUser instanceof Response) return adminUser;

  if (action !== "issue_access" && action !== "reset_password") {
    return json({ error: "unknown_action" }, 400);
  }

  const profileId = (body.profile_id ?? "").trim();
  if (!profileId) return json({ error: "profile_id_required" }, 400);

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, full_name, email, user_id, is_active, deleted_at")
    .eq("id", profileId)
    .maybeSingle();
  if (pErr) return json({ error: pErr.message }, 500);
  if (!profile || profile.deleted_at) return json({ error: "Сотрудник не найден" }, 404);
  if (!profile.is_active) return json({ error: "Сотрудник неактивен" }, 400);

  const email = normalizeEmail((profile.email as string | null) ?? "");
  if (!email || !email.includes("@")) {
    return json({ error: "Сначала укажите email сотрудника и сохраните карточку" }, 400);
  }

  const password = generatePassword(12);

  try {
    if (action === "issue_access") {
      if (profile.user_id) {
        return json({ error: "У сотрудника уже есть доступ. Используйте сброс пароля." }, 400);
      }

      // email не должен быть привязан к другому профилю
      const { data: clash } = await admin
        .from("profiles")
        .select("id, full_name")
        .is("deleted_at", null)
        .neq("id", profileId)
        .ilike("email", email)
        .not("user_id", "is", null)
        .maybeSingle();
      if (clash) {
        return json(
          {
            error: `Email уже привязан к сотруднику «${clash.full_name}»`,
          },
          400,
        );
      }

      const { userId } = await ensureAuthUser(admin, email, password);

      const { data: linked } = await admin
        .from("profiles")
        .select("id, full_name")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .neq("id", profileId)
        .maybeSingle();
      if (linked) {
        return json(
          {
            error: `Этот аккаунт уже привязан к «${linked.full_name}»`,
          },
          400,
        );
      }

      const { error: updErr } = await admin
        .from("profiles")
        .update({ user_id: userId, email })
        .eq("id", profileId);
      if (updErr) return json({ error: updErr.message }, 500);

      await markResetRequestsDone(admin, profileId, adminUser.profileId);
      const mail = await sendCredentialsEmail(
        email,
        profile.full_name as string,
        password,
        "issue",
      );

      return json({
        ok: true,
        action,
        email,
        password,
        emailed: mail.emailed,
        emailError: mail.emailError ?? null,
      });
    }

    // reset_password
    let userId = profile.user_id as string | null;
    if (!userId) {
      return json({ error: "Сначала выдайте доступ сотруднику" }, 400);
    }

    const upd = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (upd.error) {
      // если user_id битый — пересоздаём/находим по email
      const ensured = await ensureAuthUser(admin, email, password);
      userId = ensured.userId;
      await admin.from("profiles").update({ user_id: userId, email }).eq("id", profileId);
    }

    await markResetRequestsDone(admin, profileId, adminUser.profileId);
    const mail = await sendCredentialsEmail(
      email,
      profile.full_name as string,
      password,
      "reset",
    );

    return json({
      ok: true,
      action,
      email,
      password,
      emailed: mail.emailed,
      emailError: mail.emailError ?? null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
