import nodemailer from "npm:nodemailer@6.9.16";
import { notifyConfig } from "./env.ts";

/** Telegram не принимает localhost/private IP в url-кнопках — только публичный http(s). */
function isPublicHttpUrl(link: string): boolean {
  try {
    const u = new URL(link);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function sendTelegram(
  chatId: string,
  text: string,
  opts?: { buttonUrl?: string; buttonText?: string },
): Promise<void> {
  const { telegramToken } = notifyConfig();
  if (!telegramToken) throw new Error("TELEGRAM_BOT_TOKEN не задан");

  const buttonUrl = opts?.buttonUrl?.trim() || "";
  const useButton = !!buttonUrl && isPublicHttpUrl(buttonUrl);

  let finalText = text;
  let parseMode: string | undefined;
  if (buttonUrl && !useButton) {
    // Локально: кликабельная HTML-ссылка (кнопку Telegram отклонит).
    finalText = `${text}\n\n<a href="${buttonUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${
      opts?.buttonText ?? "Открыть"
    }</a>`;
    parseMode = "HTML";
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: finalText,
    disable_web_page_preview: true,
  };
  if (parseMode) payload.parse_mode = parseMode;
  if (useButton) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: opts?.buttonText ?? "Открыть", url: buttonUrl }]],
    };
  }

  const apiBase = (Deno.env.get("TELEGRAM_API_BASE") ?? "https://api.telegram.org").replace(/\/$/, "");
  const res = await fetch(`${apiBase}/bot${telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(`Telegram: ${body.description ?? res.statusText}`);
  }
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const cfg = notifyConfig();
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass) {
    throw new Error("SMTP_HOST / SMTP_USER / SMTP_PASS не заданы");
  }
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });
  await transporter.sendMail({
    from: cfg.smtpFrom || cfg.smtpUser,
    to,
    subject,
    text,
  });
}

export function formatMessage(row: {
  kind: string;
  title: string;
  object_name: string;
  days: number;
  entity_type: string;
  object_id: string;
  entity_id: string;
}): { subject: string; text: string; link: string } {
  const { appUrl } = notifyConfig();
  if (row.kind === "password_reset" || row.entity_type === "profile") {
    const link = `${appUrl}/directories?tab=employees`;
    return {
      subject: `[Лидер] ${row.title}`,
      text: row.title,
      link,
    };
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
  const subject = `[Лидер] ${row.title}`;
  const text = [row.title, `Объект: ${row.object_name}`, `Срок: ${daysLabel}`].join("\n");
  return { subject, text, link };
}
