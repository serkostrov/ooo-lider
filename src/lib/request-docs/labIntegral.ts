import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { formatDate } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { formatLongRuDate } from "./labMosgaz";
import { normalizeCallTime, valueOrDefault } from "./technadzor";
import {
  buildDirectorTable,
  buildLetterheadHeader,
  buildPerformerFooter,
  DEFAULT_PERFORMER,
  LETTERHEAD_PAGE_MARGINS,
  LIDER_DIRECTOR,
  loadLetterheadPng,
  loadSignPng,
  loadStampPng,
} from "./letterhead";

export const LAB_INTEGRAL_RECIPIENT = "В лабораторию ООО «Интеграл»";
/** Табличный бланк «просвет стыков» в лабораторию Мосгаза. */
export const LAB_MOSGAZ_TABLE_RECIPIENT = "В лабораторию технического надзора АО «МОСГАЗ»";
export const LAB_INTEGRAL_BUILDER = "ООО «ЛИДЕР»";
export const LAB_INTEGRAL_DIRECTOR = LIDER_DIRECTOR;

export const LAB_INTEGRAL_DEFAULT_NORMS =
  "СП 42-102-2004, СП 62.13330.2011 (СНиП 42-001-06), РД 01-001-06 и СП 42-103-2004";

export const LAB_INTEGRAL_DEFAULT_METHOD = "Ультразвуковой / Радиографический";

export const LAB_INTEGRAL_DEFAULT_CONDITIONS =
  "Просим Вас произвести просвет стыков с получением результатов на месте";

/** Ширины колонок основной таблицы из образца (dxa). */
const MAIN_COLS = [533, 3890, 4987] as const;
const MAIN_TABLE_W = 9410;

/** Шапка «Исх. № | Кому» из образца. */
const HEAD_COLS = [4672, 4818] as const;
const HEAD_TABLE_W = 9490;

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
/** Ячейки без рамок. */
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
} as const;
/** Таблица без рамок (иначе docx рисует дефолтную сетку). */
const TABLE_NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
} as const;
const TABLE_GRID_BORDERS = {
  top: CELL_BORDER,
  bottom: CELL_BORDER,
  left: CELL_BORDER,
  right: CELL_BORDER,
  insideHorizontal: CELL_BORDER,
  insideVertical: CELL_BORDER,
} as const;

export type LabIntegralObjectCtx = {
  name: string;
  address: string;
  utnNumber?: string;
  utnDate?: string | null;
};

export type LabIntegralFillInput = {
  outNumber: string;
  letterDate: string;
  recipient: string;
  method: string;
  callDate: string;
  callTime: string;
  norms: string;
  conditions: string;
  objectName: string;
  /** № и дата регистрации проекта в УТН (строка 7 бланка). */
  projectReg: string;
  address: string;
  specimens: string;
  responsible: string;
  note: string;
  /** Строка подвала «Исполнитель: …» */
  performer: string;
};

function formatProjectReg(utnNumber?: string, utnDate?: string | null): string {
  const num = (utnNumber ?? "").trim();
  if (!num) return "";
  if (utnDate && /^\d{4}-\d{2}-\d{2}$/.test(utnDate)) {
    return `№${num} от ${formatDate(utnDate)} г.`;
  }
  return `№${num}`;
}

export function buildLabIntegralFillInput(args: {
  requestNumber: number | string;
  callDate: string;
  values: { label: string; value: unknown }[];
  fields: { label: string; default_value: unknown }[];
  objectCtx: LabIntegralObjectCtx;
  recipient?: string;
}): LabIntegralFillInput {
  const callTime = valueOrDefault(args.values, args.fields, "Время вызова");
  const method = valueOrDefault(args.values, args.fields, "Метод контроля");
  const norms = valueOrDefault(args.values, args.fields, "Нормы контроля");
  const conditions = valueOrDefault(args.values, args.fields, "Условия / виды работ");
  const projectRegField = valueOrDefault(
    args.values,
    args.fields,
    "Номер и дата регистрации проекта в УТН",
  );
  const specimens = valueOrDefault(args.values, args.fields, "Типоразмер и пикеты");
  const pickets = valueOrDefault(args.values, args.fields, "Пикеты (от – до)");
  const responsible = valueOrDefault(args.values, args.fields, "Ответственный за производство работ");
  const note = valueOrDefault(args.values, args.fields, "Примечание");
  const outRaw = valueOrDefault(args.values, args.fields, "Исх. №");
  const performerRaw = valueOrDefault(args.values, args.fields, "Исполнитель");

  const specimensFull = [specimens.trim(), pickets.trim()].filter(Boolean).join("\n") || pickets.trim();

  if (!callTime.trim()) throw new Error("Укажите «Время вызова»");
  if (!method.trim()) throw new Error("Укажите «Метод контроля»");
  if (!specimensFull.trim()) throw new Error("Укажите пикеты или типоразмер");
  if (!responsible.trim()) throw new Error("Укажите ответственного за производство работ");

  const projectReg =
    projectRegField.trim() || formatProjectReg(args.objectCtx.utnNumber, args.objectCtx.utnDate);

  const methodNorm = method.trim() || LAB_INTEGRAL_DEFAULT_METHOD;
  const isJointClearance =
    /радиограф|ультразвук|просвет/i.test(methodNorm) || methodNorm === LAB_INTEGRAL_DEFAULT_METHOD;

  return {
    outNumber: outRaw.trim() || String(args.requestNumber),
    letterDate: mskToday(),
    recipient: (args.recipient ?? LAB_INTEGRAL_RECIPIENT).trim() || LAB_INTEGRAL_RECIPIENT,
    method: methodNorm,
    callDate: args.callDate,
    callTime: normalizeCallTime(callTime),
    norms: norms.trim() || LAB_INTEGRAL_DEFAULT_NORMS,
    conditions:
      conditions.trim() || (isJointClearance ? LAB_INTEGRAL_DEFAULT_CONDITIONS : ""),
    objectName: args.objectCtx.name,
    projectReg,
    address: args.objectCtx.address,
    specimens: specimensFull.trim(),
    responsible: responsible.trim(),
    note: note.trim(),
    performer: performerRaw.trim() || DEFAULT_PERFORMER,
  };
}

export function labIntegralPreviewRows(input: LabIntegralFillInput): { label: string; value: string }[] {
  return [
    { label: "Исх. №", value: input.outNumber },
    { label: "Дата исходящего", value: formatDate(input.letterDate) },
    { label: "Кому", value: input.recipient || LAB_INTEGRAL_RECIPIENT },
    { label: "1. Заказчик", value: LAB_INTEGRAL_BUILDER },
    { label: "2. Метод контроля", value: input.method },
    {
      label: "3. Дата и время",
      value: `${formatDate(input.callDate)} ${input.callTime}`,
    },
    { label: "4. Нормы", value: input.norms },
    { label: "5. Условия выполнения контроля", value: input.conditions },
    { label: "6. Объект", value: input.objectName },
    {
      label: "7. Номер и дата регистрации проекта в УТН",
      value: input.projectReg,
    },
    { label: "8. Адрес контроля", value: input.address },
    { label: "9. Типоразмер и пикеты", value: input.specimens },
    { label: "10. Представитель", value: input.responsible },
    { label: "Примечание", value: input.note },
  ];
}

function run(text: string, opts?: { bold?: boolean; size?: number }) {
  return new TextRun({
    text: text || " ",
    bold: opts?.bold === true,
    font: "Times New Roman",
    // Образец АНПИ: w:sz=28 → 14pt
    size: opts?.size ?? 28,
  });
}

/** Одна строка в ячейке — как в «АНПИ Интеграл.docx»: 14pt, умеренные поля. */
function mainCell(text: string, width: number, opts?: { bold?: boolean }) {
  const bold = opts?.bold === true;
  const flat = text.replace(/\s*\n+\s*/g, ", ").trim() || " ";
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    // Рамки только у таблицы (tblBorders), как в образце — без двойных линий на ячейках.
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 276 },
        children: [run(flat, { bold })],
      }),
    ],
  });
}

function mainRow(n: string, label: string, value: string) {
  return new TableRow({
    children: [
      mainCell(n, MAIN_COLS[0], { bold: true }),
      mainCell(label, MAIN_COLS[1], { bold: true }),
      mainCell(value, MAIN_COLS[2]),
    ],
  });
}

function headTable(outLine: string, recipient: string) {
  return new Table({
    width: { size: HEAD_TABLE_W, type: WidthType.DXA },
    columnWidths: [...HEAD_COLS],
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: HEAD_COLS[0], type: WidthType.DXA },
            borders: NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 40 },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0, line: 240 },
                children: [run(outLine, { bold: true, size: 24 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: HEAD_COLS[1], type: WidthType.DXA },
            borders: NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 40, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 0, after: 0, line: 240 },
                children: [run(recipient, { bold: true, size: 24 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

export type LabIntegralTableRow = { number: string; label: string; value: string };

/** Строки таблицы по умолчанию (официальный бланк). */
export function defaultLabIntegralTableRows(input: LabIntegralFillInput): LabIntegralTableRow[] {
  const when = `${formatDate(input.callDate)} ${input.callTime}`;
  return [
    { number: "1", label: "Заказчик", value: LAB_INTEGRAL_BUILDER },
    { number: "2", label: "Метод контроля качества", value: input.method },
    { number: "3", label: "Дата и время проведения работ", value: when },
    { number: "4", label: "Нормы, по которым необходимо производить контроль", value: input.norms },
    { number: "5", label: "Условия выполнения контроля", value: input.conditions || "—" },
    { number: "6", label: "Объект", value: input.objectName },
    {
      number: "7",
      label: "Номер и дата регистрации проекта в Управлении технического надзора",
      value: input.projectReg || "—",
    },
    { number: "8", label: "Точный фактический адрес контроля", value: input.address || "—" },
    {
      number: "9",
      label:
        "Типоразмер и свойства контролируемых «изделий и/или элементов» и их точное количество в зависимости от метода контроля (диаметр, толщина, длина, пикеты, давление и др.)",
      value: input.specimens,
    },
    {
      number: "10",
      label: "ФИО и контактные телефоны представителей заказчика на объекте",
      value: input.responsible,
    },
  ];
}

export async function fillLabIntegralDocx(
  input: LabIntegralFillInput,
  tableRows?: LabIntegralTableRow[] | null,
): Promise<ArrayBuffer> {
  const rows = tableRows && tableRows.length > 0 ? tableRows : defaultLabIntegralTableRows(input);
  const [letterhead, stamp, sign] = await Promise.all([
    loadLetterheadPng(),
    loadStampPng(),
    loadSignPng(),
  ]);

  const spacer = (after = 60) =>
    new Paragraph({ spacing: { before: 0, after, line: 240 }, children: [] });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 20 },
          paragraph: { spacing: { after: 0, line: 240 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { ...LETTERHEAD_PAGE_MARGINS },
          },
        },
        headers: {
          default: buildLetterheadHeader(letterhead),
        },
        footers: {
          default: buildPerformerFooter(input.performer || DEFAULT_PERFORMER),
        },
        children: [
          headTable(
            `Исх. № ${input.outNumber} от ${formatLongRuDate(input.letterDate)}`,
            input.recipient || LAB_INTEGRAL_RECIPIENT,
          ),
          spacer(160),
          new Table({
            width: { size: MAIN_TABLE_W, type: WidthType.DXA },
            columnWidths: [...MAIN_COLS],
            borders: TABLE_GRID_BORDERS,
            rows: rows.map((r) => mainRow(r.number, r.label, r.value)),
          }),
          ...(input.note.trim()
            ? [
                spacer(120),
                new Paragraph({
                  spacing: { before: 0, after: 0, line: 240 },
                  children: [run(`Примечание: ${input.note.trim()}`, { size: 20 })],
                }),
              ]
            : []),
          spacer(280),
          buildDirectorTable({
            director: LAB_INTEGRAL_DIRECTOR,
            stamp,
            sign,
          }),
        ],
      },
    ],
  });

  return Packer.toArrayBuffer(doc);
}

export function labIntegralFileName(requestNumber: number | string, callDate: string) {
  const d = callDate ? formatDate(callDate).replace(/\./g, "-") : "без-даты";
  return `Лаб_Интеграл_заявка_${requestNumber}_${d}.docx`;
}

export function labMosgazTableFileName(requestNumber: number | string, callDate: string) {
  const d = callDate ? formatDate(callDate).replace(/\./g, "-") : "без-даты";
  return `Лаб_МГ_заявка_${requestNumber}_${d}.docx`;
}
