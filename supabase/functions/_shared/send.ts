import nodemailer from "npm:nodemailer@6.9.16";
import { notifyConfig } from "./env.ts";

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const { telegramToken } = notifyConfig();
  if (!telegramToken) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
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
      text: [row.title, "", `Открыть: ${link}`].join("\n"),
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
  const text = [
    row.title,
    `Объект: ${row.object_name}`,
    `Срок: ${daysLabel}`,
    "",
    `Открыть: ${link}`,
  ].join("\n");
  return { subject, text, link };
}
