import type { CurrentProfile } from "@/lib/profile";

/**
 * Локальный обход Auth (только opt-in). На стенде показа и приёмке §11 — выключен.
 * Включить: VITE_AUTH_BYPASS=true в .env, затем перезапустить dev-сервер.
 * В production-сборке всегда false — даже если переменная попала в окружение.
 */
export const AUTH_BYPASS =
  import.meta.env.MODE !== "production" && import.meta.env["VITE_AUTH_BYPASS"] === "true";

export const BYPASS_USER_ID = "00000000-0000-4000-8000-000000000001";

export const BYPASS_PROFILE: CurrentProfile = {
  id: "00000000-0000-4000-8000-000000000002",
  full_name: "Тестовый админ",
  role_code: "admin",
  role_name: "Администратор (без входа)",
  is_admin: true,
};
