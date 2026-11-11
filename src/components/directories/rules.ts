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
  { v: "select" as const, label: "Выпадающий список" },
  { v: "checkbox" as const, label: "Галочка" },
  { v: "file" as const, label: "Файл (фото, видео, PDF)" },
  { v: "picket_range" as const, label: "Пикеты (от – до)" },
];

export const FILLED_BY = [
  { v: "initiator" as const, label: "Прораб при создании" },
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

export function validateCustomerContact(v: { full_name: string; phone: string; email: string }): RuleError {
  if (!v.full_name.trim()) return "Заполните ФИО";
  if (!isOptionalPhone(v.phone)) return VALIDATION_MSG.phone;
  if (!isOptionalEmail(v.email)) return VALIDATION_MSG.email;
  return null;
}

export function validateEmployee(v: { full_name: string; role_code: string; phone: string; email: string }): RuleError {
  if (!v.full_name.trim() || !v.role_code) return "Заполните ФИО и роль";
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
  const num = toIntOrNull(v.number);
  const dur = toIntOrNull(v.duration);
  const resp = toIntOrNull(v.responseDays);
  const rem = toIntOrNull(v.remindDays);
  if (num === null || num === "bad" || num < 1) return "Номер этапа — целое число больше 0";
  if (dur === "bad" || resp === "bad" || rem === "bad") return "Сроки — целые числа от 0 или пусто";
  if (!v.name.trim()) return "Укажите название этапа";
  if (!v.workTypeId) return "Выберите группу";
  if (v.existing.some((s) => s.number === num && s.id !== v.currentId)) {
    return `Этап с номером ${num} уже есть`;
  }
  return null;
}
