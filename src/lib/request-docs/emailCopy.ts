import {
  DEMO_VALUES,
  PLACEHOLDER_SUGGESTIONS,
} from "@/components/directories/blank-constructor/types";

/** Шаблоны сопроводительного письма при отправке бланка заявки. */

export type EmailCopyVars = {
  number: string | number;
  type: string;
  object: string;
  call_date: string;
};

export const DEFAULT_EMAIL_TITLE = `[Лидер] Заявка №{{№ заявки}} «{{Вид заявки}}»`;

export const DEFAULT_EMAIL_SUBTITLE = [
  `Здравствуйте!`,
  ``,
  `Во вложении бланк заявки №{{№ заявки}} ({{Вид заявки}}).`,
  `Объект: {{Объект}}`,
  `Дата вызова: {{Дата вызова}}`,
  ``,
  `ООО «Лидер»`,
].join("\n");

/** Переменные письма + те же поля, что в конструкторе бланков. */
export const EMAIL_PLACEHOLDER_SUGGESTIONS = [
  { key: "№ заявки", label: "№ заявки", group: "Письмо" as const },
  { key: "Вид заявки", label: "Вид заявки", group: "Письмо" as const },
  { key: "Объект", label: "Объект", group: "Письмо" as const },
  { key: "Дата вызова", label: "Дата вызова", group: "Письмо" as const },
  ...PLACEHOLDER_SUGGESTIONS,
];

export type EmailPlaceholderSuggestion = (typeof EMAIL_PLACEHOLDER_SUGGESTIONS)[number];

export const EMAIL_PLACEHOLDER_GROUPS = ["Письмо", "Поля заявки", "Объект"] as const;

/** Карта значений из переменных письма (+ старые англ. ключи). */
export function emailVarsToMap(vars: EmailCopyVars): Record<string, string> {
  const number = String(vars.number ?? "");
  const type = vars.type ?? "";
  const object = vars.object ?? "";
  const call_date = vars.call_date ?? "";
  return {
    "№ заявки": number,
    "Номер заявки": number,
    "Вид заявки": type,
    Объект: object,
    "Название объекта": object,
    "Дата вызова": call_date,
    // совместимость со старыми шаблонами
    number,
    type,
    object,
    call_date,
  };
}

const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function renderEmailTemplate(
  template: string,
  vars: EmailCopyVars,
  extraMap: Record<string, string> = {},
): string {
  const map: Record<string, string> = {
    ...DEMO_VALUES,
    ...extraMap,
    ...emailVarsToMap(vars),
  };
  return template.replace(PLACEHOLDER_RE, (_, raw: string) => {
    const key = raw.trim();
    if (!key) return "";
    const hit = map[key];
    if (hit != null && String(hit).trim() !== "") return String(hit);
    // регистронезависимый поиск
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(map)) {
      if (k.toLowerCase() === lower && String(v).trim()) return String(v);
    }
    return `{{${key}}}`;
  });
}

export function resolveEmailTitle(
  template: string | null | undefined,
  vars: EmailCopyVars,
  extraMap?: Record<string, string>,
): string {
  const raw = (template ?? "").trim() || DEFAULT_EMAIL_TITLE;
  return (
    renderEmailTemplate(raw, vars, extraMap).trim() ||
    renderEmailTemplate(DEFAULT_EMAIL_TITLE, vars, extraMap)
  );
}

export function resolveEmailSubtitle(
  template: string | null | undefined,
  vars: EmailCopyVars,
  extraMap?: Record<string, string>,
): string {
  const raw = (template ?? "").trim() || DEFAULT_EMAIL_SUBTITLE;
  return (
    renderEmailTemplate(raw, vars, extraMap).trim() ||
    renderEmailTemplate(DEFAULT_EMAIL_SUBTITLE, vars, extraMap)
  );
}

/** Примерные значения для предпросмотра в справочнике вида. */
export function sampleEmailVars(typeName: string): EmailCopyVars {
  return {
    number: 128,
    type: typeName.trim() || "Вид заявки",
    object: "Пример объекта",
    call_date: "01.12.2026",
  };
}

/** Имя вложения для превью (без генерации файла). */
export function previewAttachmentFileName(
  docTemplate: string | null | undefined,
  number: string | number,
  callDate: string,
): string | null {
  const n = String(number || "…");
  const d = (callDate || "без-даты").replace(/\./g, "-");
  switch (docTemplate) {
    case "technadzor_xlsx":
      return `Технадзор_заявка_${n}_${d}.xlsx`;
    case "lab_mosgaz_docx":
    case "lab_mosgaz_table_docx":
      return `Лаб_МГ_заявка_${n}_${d}.docx`;
    case "lab_integral_docx":
      return `Лаб_Интеграл_заявка_${n}_${d}.docx`;
    case "geotrest_message":
      return null;
    default:
      return docTemplate ? `Бланк_заявка_${n}_${d}` : null;
  }
}
