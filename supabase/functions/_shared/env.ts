/** Секреты из env / supabase secrets — потом просто меняем значения. */
export function env(name: string, fallback = ""): string {
  return (Deno.env.get(name) ?? fallback).trim();
}

export function notifyConfig() {
  return {
    enabled: env("NOTIFY_ENABLED", "true") !== "false",
    appUrl: env("APP_URL", env("VITE_APP_URL", "http://localhost:8080")).replace(/\/$/, ""),
    telegramToken: env("TELEGRAM_BOT_TOKEN"),
    telegramBotUsername: env("TELEGRAM_BOT_USERNAME", env("VITE_TELEGRAM_BOT_USERNAME")),
    smtpHost: env("SMTP_HOST"),
    smtpPort: Number(env("SMTP_PORT", "587")) || 587,
    smtpUser: env("SMTP_USER"),
    smtpPass: env("SMTP_PASS"),
    smtpFrom: env("SMTP_FROM", env("SMTP_USER")),
    cronSecret: env("NOTIFY_CRON_SECRET"),
  };
}
