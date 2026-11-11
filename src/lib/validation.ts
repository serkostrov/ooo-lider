import { parsePhoneNumberFromString } from "libphonenumber-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string) {
  return EMAIL_RE.test(s.trim());
}

/** Пустое или корректный email. */
export function isOptionalEmail(s: string) {
  const t = s.trim();
  return t === "" || isValidEmail(t);
}

/** Поле заявки «Адрес отправки (email)» и похожие. */
export function looksLikeEmailField(field: { label: string; field_type: string }) {
  return field.field_type === "text" && /e-?mail|почт/i.test(field.label);
}

/** Маска ввода телефона РФ. */
export const PHONE_MASK = "+{7} (000) 000-00-00";

/** Пустое или валидный телефон РФ / международный (libphonenumber). */
export function isOptionalPhone(s: string) {
  const t = s.trim();
  if (t === "") return true;
  const parsed = parsePhoneNumberFromString(t, "RU");
  return parsed?.isValid() ?? false;
}

/** Нормализация перед сохранением: +7… или null. */
export function normalizePhone(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const parsed = parsePhoneNumberFromString(t, "RU");
  if (parsed?.isValid()) return parsed.format("E.164");
  return t;
}

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

/** ИНН юрлица (10) или ИП (12). Пусто — ок. */
export function isOptionalInn(s: string) {
  const d = onlyDigits(s);
  if (d === "") return true;
  return d.length === 10 || d.length === 12;
}

/** КПП — 9 цифр. Пусто — ок. */
export function isOptionalKpp(s: string) {
  const d = onlyDigits(s);
  return d === "" || d.length === 9;
}

/** ОГРН (13) или ОГРНИП (15). Пусто — ок. */
export function isOptionalOgrn(s: string) {
  const d = onlyDigits(s);
  if (d === "") return true;
  return d.length === 13 || d.length === 15;
}

export function digitsOnlyOrNull(s: string): string | null {
  const d = onlyDigits(s);
  return d === "" ? null : d;
}

export const VALIDATION_MSG = {
  email: "Укажите корректный email, например name@company.ru",
  phone: "Укажите телефон в формате +7 (999) 123-45-67",
  inn: "ИНН: 10 цифр (юрлицо) или 12 (ИП)",
  kpp: "КПП: 9 цифр",
  ogrn: "ОГРН: 13 цифр или ОГРНИП: 15",
} as const;
