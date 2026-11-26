import {
  isOptionalEmail,
  isOptionalInn,
  isOptionalKpp,
  isOptionalOgrn,
  isOptionalPhone,
  VALIDATION_MSG,
} from "@/lib/validation";

export type RuleError = string | null;

/** Разделы документов (справочник). */
export const DOC_SECTIONS = ["ГСН", "ГСВ", "МосГаз", "МГГТ и Геотрест", "Органы города"] as const;

/** Типовые должности контакта заказчика. */
export const CONTACT_POSITIONS = ["Куратор", "Технадзор", "Технадзор ЭХЗ", "ГИП", "Геотрест"] as const;

/** Виды условий этапа. */
export const CONDITION_KINDS = [
  { v: "check" as const, label: "Отметка" },
  { v: "file" as const, label: "Файл" },
  { v: "field" as const, label: "Поле" },
];

/** Виды действий сценария этапа. */
export const ACTION_KINDS = [
  { v: "fill" as const, label: "Заполнить" },
  { v: "attach" as const, label: "Прикрепить" },
  { v: "send" as const, label: "Отправить" },
  { v: "confirm" as const, label: "Подтвердить" },
  { v: "other" as const, label: "Другое" },
];

/** Типы полей заявки. */
export const FIELD_TYPES = [
  { v: "text" as const, label: "Текст" },
  { v: "textarea" as const, label: "Многострочный текст" },
  { v: "number" as const, label: "Число" },
  { v: "date" as const, label: "Дата" },
  { v: "time" as const, label: "Время" },
  { v: "select" as const, label: "Выпадающий список" },
  { v: "checkbox" as const, label: "Галочка" },
  { v: "file" as const, label: "Файл (фото, видео, PDF)" },
  { v: "picket_range" as const, label: "Пикеты (от – до)" },
];

export const FILLED_BY = [
  { v: "initiator" as const, label: "Прораб" },
  { v: "office" as const, label: "Офис-менеджер" },
];

/** Системные коды сценария этапа — удалять нельзя. */
export const SYSTEM_STAGE_STATUSES = new Set([
  "not_started",
  "in_work",
  "sent",
  "waiting_visit",
  "on_approval",
  "on_review",
  "closed",
]);

export function isSystemStageStatus(code: string) {
  return SYSTEM_STAGE_STATUSES.has(code);
}

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(v: string) {
  return HEX.test(v);
}

export function matches(search: string, ...values: (string | null | undefined)[]) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => v?.toLowerCase().includes(q));
}

export function emptyToNull(v: string) {
  const t = v.trim();
  return t === "" ? null : t;
}

/** Целое ≥ 0 или null из текстового поля. */
export function toIntOrNull(v: string): number | null | "bad" {
  const t = v.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return "bad";
  return Number(t);
}

/** Целое или дробное > 0 (1, 1.1, 2,5). Пусто → null. */
export function toPositiveNumberOrNull(v: string): number | null | "bad" {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return "bad";
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return "bad";
  return n;
}

/** Транслит названия → code для ролей/статусов. */
export function slugCode(name: string, fallback = "item") {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  const latin = name
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
  return latin.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || fallback;
}

/** Уникальный code, если базовый уже занят: foo → foo_2. */
export function uniqueCode(base: string, taken: Iterable<string>) {
  const set = taken instanceof Set ? taken : new Set(taken);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

export function nextSort(items: { sort: number }[]) {
  return Math.max(0, ...items.map((x) => x.sort)) + 1;
}

/** Перестановка в списке справочника. */
export function moveItem<T>(items: T[], from: number, to: number): T[] | null {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return null;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (!item) return null;
  next.splice(to, 0, item);
  return next;
}

export function normalizeDirectoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function escapeIlike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function parseFieldOptions(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Подпись документа без расширения. */
export function docTitleFromFile(name: string) {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

export function validateCustomer(v: { name: string; inn: string; kpp: string; ogrn: string }): RuleError {
  if (!v.name.trim()) return "Заполните название";
  if (!isOptionalInn(v.inn)) return VALIDATION_MSG.inn;
  if (!isOptionalKpp(v.kpp)) return VALIDATION_MSG.kpp;
  if (!isOptionalOgrn(v.ogrn)) return VALIDATION_MSG.ogrn;
  return null;
}

/**
 * Несколько телефонов/email — через «; ».
 * Склеитые через пробел номера вида `8(… ) 8(…)` тоже разделяем.
 */
export function normalizeMultiContacts(s: string): string | null {
  const prepared = s
    .replace(/\r\n/g, "\n")
    .replace(/\s+(?=(?:\+7|8)\s*\()/g, "; ")
    .replace(/\s+(?=(?:\+7|8)\d)/g, "; ");
  const parts = prepared
    .split(/[;\n,]+/)
    .map((x) => x.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

/** Разбить сохранённую строку на поля формы (всегда ≥1 элемент). */
export function splitMultiContacts(s: string | null | undefined): string[] {
  if (!s?.trim()) return [""];
  return normalizeMultiContacts(s)?.split("; ") ?? [""];
}

/** Склеить поля формы обратно в строку для БД. */
export function joinMultiContacts(parts: string[]): string | null {
  return normalizeMultiContacts(parts.join("; "));
}

/** Несколько телефонов/email через ; , или перевод строки (и «склеенные» через пробел 8…). */
function splitContactParts(s: string): string[] {
  return (
    normalizeMultiContacts(s)
      ?.split("; ")
      .map((x) => x.trim())
      .filter(Boolean) ?? []
  );
}

/** Добавочный в скобках в конце: `8(495)… (42-43)` — не ломает проверку номера. */
function phoneCoreForValidation(p: string): string {
  return p.replace(/\s*\(\d[\d\-–—]*\d\)\s*$/u, "").trim();
}

export function validateCustomerContact(v: { full_name: string; phone: string; email: string }): RuleError {
  if (!v.full_name.trim()) return "Заполните ФИО";
  for (const p of splitContactParts(v.phone)) {
    if (!isOptionalPhone(phoneCoreForValidation(p))) return VALIDATION_MSG.phone;
  }
  for (const e of splitContactParts(v.email)) {
    if (!isOptionalEmail(e)) return VALIDATION_MSG.email;
  }
  return null;
}

/** Внешний контакт: ФИО/название обязательно; телефон и почта — один или несколько. */
export function validateExternalContact(v: {
  full_name: string;
  phone: string;
  email: string;
}): RuleError {
  if (!v.full_name.trim()) return "Заполните ФИО или название";
  for (const p of splitContactParts(v.phone)) {
    if (!isOptionalPhone(phoneCoreForValidation(p))) return VALIDATION_MSG.phone;
  }
  for (const e of splitContactParts(v.email)) {
    if (!isOptionalEmail(e)) return VALIDATION_MSG.email;
  }
  return null;
}

/** Допустимо: одна роль или только пара сметчик+снабжение. */
export const COMBINABLE_ROLES = ["estimator", "supply"] as const;

export function isAllowedEmployeeRoles(roles: string[]): boolean {
  const uniq = [...new Set(roles.filter(Boolean))].sort();
  if (uniq.length === 0) return false;
  if (uniq.length === 1) return true;
  return (
    uniq.length === 2 &&
    uniq[0] === "estimator" &&
    uniq[1] === "supply"
  );
}

export function validateEmployee(v: {
  full_name: string;
  role_code?: string;
  role_codes?: string[];
  phone: string;
  email: string;
}): RuleError {
  const roles = (v.role_codes?.length ? v.role_codes : v.role_code ? [v.role_code] : []).filter(Boolean);
  if (!v.full_name.trim() || roles.length === 0) return "Заполните ФИО и роль";
  if (!isAllowedEmployeeRoles(roles)) {
    return "Несколько ролей можно только у сметчика и снабжения вместе";
  }
  if (!isOptionalPhone(v.phone)) return VALIDATION_MSG.phone;
  if (!isOptionalEmail(v.email)) return VALIDATION_MSG.email;
  return null;
}

export function validateRepresentative(v: { name: string; phone: string; email: string }): RuleError {
  if (!v.name.trim()) return "Заполните название";
  if (!isOptionalPhone(v.phone)) return VALIDATION_MSG.phone;
  if (!isOptionalEmail(v.email)) return VALIDATION_MSG.email;
  return null;
}

export function validateDocument(v: { name: string; section: string }): RuleError {
  if (!v.name.trim() || !v.section) return "Заполните название и раздел";
  if (!(DOC_SECTIONS as readonly string[]).includes(v.section)) return "Неизвестный раздел документа";
  return null;
}

export function validateNamedDirectoryItem(name: string): RuleError {
  return normalizeDirectoryName(name) ? null : "Заполните название";
}

export function validateRole(name: string): RuleError {
  return name.trim() ? null : "Укажите название";
}

export function validateStageStatus(v: { name: string; color: string }): RuleError {
  if (!v.name.trim()) return "Заполните название";
  if (!isHexColor(v.color)) return "Цвет должен быть в формате #RRGGBB";
  return null;
}

export function validateRequestStatus(v: {
  name: string;
  action: string;
  color: string;
  first: boolean;
}): RuleError {
  if (!v.name.trim()) return "Заполните название";
  if (!v.first && !v.action.trim()) return "Заполните текст кнопки";
  if (!isHexColor(v.color)) return "Цвет должен быть в формате #RRGGBB";
  return null;
}

export function validateRequestType(v: { name: string; send_to_email: string }): RuleError {
  if (!v.name.trim()) return "Укажите название вида заявки";
  if (!isOptionalEmail(v.send_to_email)) return VALIDATION_MSG.email;
  return null;
}

export function validateRequestField(v: {
  label: string;
  field_type: string;
  optionsText: string;
}): RuleError {
  if (!v.label.trim()) return "Укажите подпись поля";
  if (!FIELD_TYPES.some((t) => t.v === v.field_type)) return "Неизвестный тип поля";
  if (v.field_type === "select" && parseFieldOptions(v.optionsText).length === 0) {
    return "Для выпадающего списка укажите варианты";
  }
  return null;
}

export function validateStageTemplate(v: {
  number: string;
  name: string;
  workTypeId: string;
  duration: string;
  responseDays: string;
  remindDays: string;
  existing: { id: string; number: number }[];
  currentId?: string | null;
}): RuleError {
  const num = toPositiveNumberOrNull(v.number);
  const dur = toIntOrNull(v.duration);
  const resp = toIntOrNull(v.responseDays);
  const rem = toIntOrNull(v.remindDays);
  if (num === null || num === "bad") return "Номер этапа — число больше 0 (можно 1.1)";
  if (dur === "bad" || resp === "bad" || rem === "bad") return "Сроки — целые числа от 0 или пусто";
  if (!v.name.trim()) return "Укажите название этапа";
  if (!v.workTypeId) return "Выберите группу";
  if (v.existing.some((s) => s.number === num && s.id !== v.currentId)) {
    return `Этап с номером ${num} уже есть`;
  }
  return null;
}
