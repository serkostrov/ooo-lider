import { formatDate } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import type {
  BlankConfig,
  ExcelColumnConfig,
  FieldSourceKind,
  TableRowConfig,
} from "@/components/directories/blank-constructor/types";
import { formatCallDateTime, valueOrDefault } from "./technadzor";
import {
  LAB_INTEGRAL_BUILDER,
  LAB_INTEGRAL_DEFAULT_CONDITIONS,
  LAB_INTEGRAL_DEFAULT_METHOD,
  LAB_INTEGRAL_DEFAULT_NORMS,
  type LabIntegralFillInput,
  type LabIntegralObjectCtx,
} from "./labIntegral";
import { DEFAULT_PERFORMER } from "./letterhead";
import type { TechnadzorFillInput, TechnadzorObjectCtx } from "./technadzor";
import type { GeotrestFillInput, GeotrestObjectCtx } from "./geotrest";
import { parseLetterDateYmd, type LabMosgazObjectCtx } from "./labMosgaz";

export type DocValueMap = Record<string, string>;

type FieldLike = { label: string; value?: unknown; default_value?: unknown };

function fieldVal(
  values: { label: string; value: unknown }[],
  fields: { label: string; default_value: unknown }[],
  label: string,
): string {
  return valueOrDefault(values, fields, label);
}

function formatProjectReg(utnNumber?: string, utnDate?: string | null): string {
  const num = (utnNumber ?? "").trim();
  if (!num) return "";
  if (utnDate && /^\d{4}-\d{2}-\d{2}$/.test(utnDate)) {
    return `№${num} от ${formatDate(utnDate)} г.`;
  }
  return `№${num}`;
}

/** Карта значений для {{плейсхолдеров}} и sourceValue конструктора. */
export function buildDocValueMap(args: {
  requestNumber: number | string;
  callDate: string;
  values: { label: string; value: unknown }[];
  fields: { label: string; default_value: unknown }[];
  object: {
    name: string;
    address: string;
    projectNumber?: string;
    utnNumber?: string;
    utnDate?: string | null;
    customer?: string;
    inspector?: string;
  };
}): DocValueMap {
  const v = args.values;
  const f = args.fields;
  const callTime = fieldVal(v, f, "Время вызова");
  const method = fieldVal(v, f, "Метод контроля") || LAB_INTEGRAL_DEFAULT_METHOD;
  const norms = fieldVal(v, f, "Нормы контроля") || LAB_INTEGRAL_DEFAULT_NORMS;
  const conditionsRaw = fieldVal(v, f, "Условия / виды работ");
  const isJointClearance =
    /радиограф|ультразвук|просвет/i.test(method) || method === LAB_INTEGRAL_DEFAULT_METHOD;
  const conditions = conditionsRaw.trim() || (isJointClearance ? LAB_INTEGRAL_DEFAULT_CONDITIONS : "");
  const specimens = fieldVal(v, f, "Типоразмер и пикеты");
  const pickets = fieldVal(v, f, "Пикеты (от – до)");
  const specimensFull = [specimens.trim(), pickets.trim()].filter(Boolean).join("\n") || pickets.trim();
  const projectRegField = fieldVal(v, f, "Номер и дата регистрации проекта в УТН");
  const projectReg =
    projectRegField.trim() || formatProjectReg(args.object.utnNumber, args.object.utnDate);
  const objectLineField = fieldVal(v, f, "Шифр и наименование объекта");
  const objectLine =
    objectLineField.trim() ||
    [args.object.projectNumber?.trim(), args.object.name.trim()].filter(Boolean).join(" ");
  const callKind = fieldVal(v, f, "Вид вызова").trim() || "КГС";
  const addressExact = fieldVal(v, f, "Точный адрес для вызова") || args.object.address;
  const outRaw = fieldVal(v, f, "Исх. №");

  const map: DocValueMap = {
    "Дата вызова": args.callDate ? formatDate(args.callDate) : "",
    "Время вызова": callTime,
    "Дата и время вызова":
      args.callDate && callTime
        ? formatCallDateTime(args.callDate, callTime)
        : args.callDate
          ? formatDate(args.callDate)
          : callTime,
    "Метод контроля": method,
    "Нормы контроля": norms,
    "Условия / виды работ": conditions,
    "Виды работ": fieldVal(v, f, "Виды работ"),
    "Пикеты (от – до)": pickets,
    "Пикеты (от–до)": pickets,
    "Типоразмер и пикеты": specimensFull,
    "Ответственный за производство работ": fieldVal(v, f, "Ответственный за производство работ"),
    "Ответственный на объекте": fieldVal(v, f, "Ответственный на объекте"),
    "Примечание": fieldVal(v, f, "Примечание"),
    "Коммуникация и объём": fieldVal(v, f, "Коммуникация и объём"),
    "Точный адрес для вызова": addressExact,
    "Вид вызова": callKind,
    "Что нужно": fieldVal(v, f, "Что нужно"),
    "Исх. №": outRaw.trim(),
    "Дата исходящего": fieldVal(v, f, "Дата исходящего").trim() || formatDate(mskToday()),
    "Исполнитель": fieldVal(v, f, "Исполнитель") || DEFAULT_PERFORMER,
    "Название объекта": args.object.name,
    "Адрес объекта": args.object.address,
    "Шифр / номер проекта": args.object.projectNumber ?? "",
    "Номер УТН": args.object.utnNumber ?? "",
    "Дата УТН": args.object.utnDate ? formatDate(args.object.utnDate) : "",
    "Регистрация проекта в УТН": projectReg,
    "Номер и дата регистрации проекта в УТН": projectReg,
    "Заказчик": args.object.customer ?? "",
    "Инспектор технадзора": args.object.inspector ?? "",
    "Шифр и наименование объекта": objectLine,
    "Строка вызова Геотрест": `${callKind} на ${args.callDate ? formatDate(args.callDate) : ""}`,
    // legacy keys
    name: args.object.name,
    address: args.object.address,
    project_number: args.object.projectNumber ?? "",
    utn_number: args.object.utnNumber ?? "",
    // constants often used
    "ООО «ЛИДЕР»": LAB_INTEGRAL_BUILDER,
  };

  // Все заполненные поля заявки — по label
  for (const row of v) {
    const label = row.label?.trim();
    if (!label) continue;
    if (map[label]?.trim()) continue;
    if (row.value == null || row.value === "") continue;
    map[label] = typeof row.value === "string" ? row.value : String(row.value);
  }
  for (const field of f) {
    const label = field.label?.trim();
    if (!label || map[label]?.trim()) continue;
    if (field.default_value == null || field.default_value === "") continue;
    map[label] =
      typeof field.default_value === "string"
        ? field.default_value
        : String(field.default_value);
  }

  return map;
}

export function resolveSourceLive(
  kind: FieldSourceKind,
  value: string,
  map: DocValueMap,
): string {
  if (kind === "constant") return value || "—";
  const key = value.trim();
  const hit = map[key];
  if (hit != null && String(hit).trim() !== "") return String(hit);
  // case-insensitive fallback
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lower && v.trim()) return v;
  }
  return "";
}

export function renderTemplateLive(template: string, map: DocValueMap): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => {
    const k = key.trim();
    return resolveSourceLive("field", k, map) || `{{${k}}}`;
  });
}

export type ResolvedTableRow = { number: string; label: string; value: string };

export function resolveTableRows(config: BlankConfig, map: DocValueMap): ResolvedTableRow[] {
  return config.tableRows.map((r, i) => ({
    number: String(i + 1),
    label: r.title,
    value: resolveSourceLive(r.sourceKind, r.sourceValue, map) || "—",
  }));
}

export function resolveExcelColumnValues(columns: ExcelColumnConfig[], map: DocValueMap): string[] {
  return columns.map((c) => resolveSourceLive(c.sourceKind, c.sourceValue, map));
}

/** Собрать LabIntegralFillInput из карты + прежняя валидация обязательных. */
export function integralInputFromMap(
  map: DocValueMap,
  args: {
    callDate: string;
    recipient: string;
    letterDate: string;
  },
): LabIntegralFillInput {
  const callTime = map["Время вызова"]?.trim() ?? "";
  const method = map["Метод контроля"]?.trim() ?? "";
  const specimens = map["Типоразмер и пикеты"]?.trim() ?? "";
  const responsible = map["Ответственный за производство работ"]?.trim() ?? "";
  if (!callTime) throw new Error("Укажите «Время вызова»");
  if (!method) throw new Error("Укажите «Метод контроля»");
  if (!specimens) throw new Error("Укажите пикеты или типоразмер");
  if (!responsible) throw new Error("Укажите ответственного за производство работ");

  return {
    outNumber: map["Исх. №"]?.trim() || "",
    letterDate: parseLetterDateYmd(map["Дата исходящего"] ?? "") ?? args.letterDate,
    recipient: args.recipient,
    method,
    callDate: args.callDate,
    callTime,
    norms: map["Нормы контроля"]?.trim() || LAB_INTEGRAL_DEFAULT_NORMS,
    conditions: map["Условия / виды работ"]?.trim() || "",
    objectName: map["Название объекта"] ?? "",
    projectReg: map["Регистрация проекта в УТН"] ?? "",
    address: map["Адрес объекта"] ?? "",
    specimens,
    responsible,
    note: map["Примечание"] ?? "",
    performer: map["Исполнитель"]?.trim() || DEFAULT_PERFORMER,
  };
}

export function technadzorInputFromMap(map: DocValueMap, callDate: string): TechnadzorFillInput {
  const callTime = map["Время вызова"]?.trim() ?? "";
  const workTypes = map["Виды работ"]?.trim() ?? "";
  const responsible = map["Ответственный за производство работ"]?.trim() ?? "";
  if (!callTime) throw new Error("Укажите «Время вызова» в заявке");
  if (!workTypes) throw new Error("Укажите «Виды работ»");
  if (!responsible) throw new Error("Укажите ответственного за производство работ");
  return {
    callDate,
    callTime,
    inspector: map["Инспектор технадзора"] ?? "",
    customer: map["Заказчик"] ?? "",
    responsibleWorks: responsible,
    address: map["Адрес объекта"] ?? "",
    workTypes,
    projectNumber: map["Шифр / номер проекта"] ?? "",
    utnNumber: map["Номер УТН"] ?? "",
    utnDate: null, // дата уже отформатирована в карте; fillTechnadzor uses ISO — keep via object
    note: map["Примечание"] ?? "",
  };
}

export function geotrestInputFromMap(map: DocValueMap, messageTemplate: string): GeotrestFillInput {
  const volume = map["Коммуникация и объём"]?.trim() ?? "";
  const responsible = map["Ответственный на объекте"]?.trim() ?? "";
  const objectLine = map["Шифр и наименование объекта"]?.trim() ?? "";
  const address = map["Точный адрес для вызова"]?.trim() || map["Адрес объекта"]?.trim() || "";
  if (!volume) throw new Error("Укажите «Коммуникация и объём»");
  if (!responsible) throw new Error("Укажите ответственного на объекте");
  if (!objectLine) throw new Error("Укажите шифр и наименование объекта");
  if (!address) throw new Error("Укажите точный адрес для вызова");

  const body = messageTemplate.trim()
    ? renderTemplateLive(messageTemplate, map)
    : undefined;

  return {
    callLine: map["Строка вызова Геотрест"] ?? "",
    objectLine,
    volume,
    address,
    responsible,
    ...(body ? { messageOverride: body } : {}),
  };
}

/** Объектный контекст → плоские поля для карты. */
export function objectCtxToFlat(ctx: {
  integral?: LabIntegralObjectCtx;
  lab?: LabMosgazObjectCtx;
  technadzor?: TechnadzorObjectCtx;
  geotrest?: GeotrestObjectCtx;
}): {
  name: string;
  address: string;
  projectNumber?: string;
  utnNumber?: string;
  utnDate?: string | null;
  customer?: string;
  inspector?: string;
} {
  const i = ctx.integral;
  const t = ctx.technadzor;
  const g = ctx.geotrest;
  const l = ctx.lab;
  return {
    name: i?.name || g?.name || l?.name || "",
    address: i?.address || t?.address || g?.address || l?.address || "",
    projectNumber: t?.projectNumber || g?.projectNumber || l?.projectNumber || "",
    utnNumber: i?.utnNumber || t?.utnNumber || "",
    utnDate: i?.utnDate ?? t?.utnDate ?? null,
    customer: t?.customer || "",
    inspector: t?.inspector || "",
  };
}

export function tableRowsFromConfigOrNull(
  config: BlankConfig | null | undefined,
): TableRowConfig[] | null {
  if (!config || config.tableRows.length === 0) return null;
  return config.tableRows;
}

/** После правки бланка в превью — обновить карту из LabIntegralFillInput. */
export function overlayIntegralOnMap(map: DocValueMap, input: LabIntegralFillInput): DocValueMap {
  return {
    ...map,
    "Исх. №": input.outNumber,
    "Метод контроля": input.method,
    "Время вызова": input.callTime,
    "Дата вызова": input.callDate ? formatDate(input.callDate) : map["Дата вызова"] ?? "",
    "Дата и время вызова": `${formatDate(input.callDate)} ${input.callTime}`.trim(),
    "Нормы контроля": input.norms,
    "Условия / виды работ": input.conditions,
    "Название объекта": input.objectName,
    "Регистрация проекта в УТН": input.projectReg,
    "Номер и дата регистрации проекта в УТН": input.projectReg,
    "Адрес объекта": input.address,
    "Типоразмер и пикеты": input.specimens,
    "Ответственный за производство работ": input.responsible,
    "Примечание": input.note,
    "Исполнитель": input.performer,
  };
}

export function overlayTechnadzorOnMap(map: DocValueMap, input: TechnadzorFillInput): DocValueMap {
  return {
    ...map,
    "Время вызова": input.callTime,
    "Дата вызова": formatDate(input.callDate),
    "Дата и время вызова": formatCallDateTime(input.callDate, input.callTime),
    "Инспектор технадзора": input.inspector,
    "Заказчик": input.customer,
    "Ответственный за производство работ": input.responsibleWorks,
    "Адрес объекта": input.address,
    "Виды работ": input.workTypes,
    "Шифр / номер проекта": input.projectNumber,
    "Номер УТН": input.utnNumber,
    "Дата УТН": input.utnDate ? formatDate(input.utnDate) : "",
    "Примечание": input.note,
  };
}

/** Не используется напрямую — подавляет unused import warning в типах FieldLike. */
export type { FieldLike };
