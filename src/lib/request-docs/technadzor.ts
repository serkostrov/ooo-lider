import ExcelJS from "exceljs";
import { formatDate } from "@/lib/format";

/** Константа бланка технадзора (как в образцах заказчика). */
export const BUILDER_ORG = `"ЛИДЕР" ООО`;

export const TECHNADZOR_TEMPLATE_URL = "/templates/technadzor.xlsx";

export type TechnadzorFillInput = {
  callDate: string; // ISO YYYY-MM-DD
  callTime: string; // «12-00» / «12:00»
  inspector: string;
  customer: string;
  responsibleWorks: string;
  address: string;
  workTypes: string;
  projectNumber: string;
  utnNumber: string;
  utnDate: string | null; // ISO or empty
  note: string;
};

/** Нормализация времени к виду «12-00». */
export function normalizeCallTime(raw: string): string {
  const t = raw.trim().replace(/\./g, ":").replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2})[:\-](\d{2})$/);
  if (!m) return raw.trim();
  return `${m[1]!.padStart(2, "0")}-${m[2]}`;
}

/** «25.05.2026 12-00» — как в Excel-образцах. */
export function formatCallDateTime(callDate: string, callTime: string): string {
  const date = formatDate(callDate);
  const time = normalizeCallTime(callTime);
  if (!time) return date;
  return `${date} ${time}`;
}

export function fieldValueByLabel(
  values: { label: string; value: unknown }[],
  label: string,
): string {
  const row = values.find((v) => v.label.trim().toLowerCase() === label.trim().toLowerCase());
  if (!row || row.value == null) return "";
  if (typeof row.value === "string") return row.value;
  if (typeof row.value === "number" || typeof row.value === "boolean") return String(row.value);
  return "";
}

/** Значения строки 9 по умолчанию (11 колонок бланка). */
export function defaultTechnadzorRowValues(input: TechnadzorFillInput): (string | number | null)[] {
  const utn = input.utnNumber.trim();
  return [
    formatCallDateTime(input.callDate, input.callTime),
    input.inspector,
    input.customer,
    BUILDER_ORG,
    input.responsibleWorks,
    input.address,
    input.workTypes,
    input.projectNumber,
    utn && /^\d+$/.test(utn) ? Number(utn) : utn || null,
    input.utnDate ? formatDate(input.utnDate) : null,
    input.note || null,
  ];
}

/** Подставляет значения в строку 9 шаблона технадзора. */
export async function fillTechnadzorWorkbook(
  input: TechnadzorFillInput,
  rowValues?: (string | number | null)[] | null,
): Promise<ArrayBuffer> {
  const res = await fetch(TECHNADZOR_TEMPLATE_URL);
  if (!res.ok) throw new Error("Не удалось загрузить шаблон технадзора");
  const buf = await res.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  // exceljs typings ждут Buffer; в браузере достаточно ArrayBuffer/Uint8Array
  await wb.xlsx.load(buf as never);
  const sh = wb.worksheets[0];
  if (!sh) throw new Error("В шаблоне нет листа");

  const set = (col: number, value: string | number | null) => {
    const cell = sh.getCell(9, col);
    if (value === null || value === "") {
      cell.value = null;
      return;
    }
    cell.value = value;
  };

  const values =
    rowValues && rowValues.length > 0 ? rowValues : defaultTechnadzorRowValues(input);
  values.forEach((v, i) => set(i + 1, v));

  const out = await wb.xlsx.writeBuffer();
  return out as ArrayBuffer;
}

export function downloadArrayBuffer(
  buf: ArrayBuffer,
  fileName: string,
  mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
) {
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function technadzorFileName(requestNumber: number | string, callDate: string) {
  const d = callDate ? formatDate(callDate).replace(/\./g, "-") : "без-даты";
  return `Технадзор_заявка_${requestNumber}_${d}.xlsx`;
}

/** Значение поля заявки или default из справочника полей вида. */
export function valueOrDefault(
  values: { label: string; value: unknown }[],
  fields: { label: string; default_value: unknown }[],
  label: string,
): string {
  const fromReq = fieldValueByLabel(values, label);
  if (fromReq.trim()) return fromReq;
  const f = fields.find((x) => x.label.trim().toLowerCase() === label.trim().toLowerCase());
  if (f?.default_value == null) return "";
  if (typeof f.default_value === "string") return f.default_value;
  if (typeof f.default_value === "number" || typeof f.default_value === "boolean") return String(f.default_value);
  return "";
}

export type TechnadzorObjectCtx = {
  address: string;
  projectNumber: string;
  utnNumber: string;
  utnDate: string | null;
  customer: string;
  inspector: string;
};

/** Собирает payload бланка; кидает Error, если не хватает обязательных для Excel полей. */
export function buildTechnadzorFillInput(args: {
  callDate: string;
  values: { label: string; value: unknown }[];
  fields: { label: string; default_value: unknown }[];
  objectCtx: TechnadzorObjectCtx;
}): TechnadzorFillInput {
  const callTime = valueOrDefault(args.values, args.fields, "Время вызова");
  const workTypes = valueOrDefault(args.values, args.fields, "Виды работ");
  const responsible = valueOrDefault(args.values, args.fields, "Ответственный за производство работ");
  const note = valueOrDefault(args.values, args.fields, "Примечание");

  if (!callTime.trim()) throw new Error("Укажите «Время вызова» в заявке");
  if (!workTypes.trim()) throw new Error("Укажите «Виды работ»");
  if (!responsible.trim()) throw new Error("Укажите ответственного за производство работ");

  return {
    callDate: args.callDate,
    callTime,
    inspector: args.objectCtx.inspector,
    customer: args.objectCtx.customer,
    responsibleWorks: responsible,
    address: args.objectCtx.address,
    workTypes,
    projectNumber: args.objectCtx.projectNumber,
    utnNumber: args.objectCtx.utnNumber,
    utnDate: args.objectCtx.utnDate,
    note,
  };
}

/** Строки превью бланка (как колонки Excel, строка 9). */
export function technadzorPreviewRows(input: TechnadzorFillInput): { label: string; value: string }[] {
  return [
    { label: "Время вызова", value: formatCallDateTime(input.callDate, input.callTime) },
    { label: "Инспектор", value: input.inspector },
    { label: "Заказчик", value: input.customer },
    { label: "Строительная организация", value: BUILDER_ORG },
    { label: "Ответственный за производство работ", value: input.responsibleWorks },
    { label: "Адрес объекта", value: input.address },
    { label: "Виды работ", value: input.workTypes },
    { label: "№ проекта", value: input.projectNumber },
    { label: "Регистрация УТН №", value: input.utnNumber },
    { label: "Регистрация УТН дата", value: input.utnDate ? formatDate(input.utnDate) : "" },
    { label: "Примечание", value: input.note },
  ];
}
