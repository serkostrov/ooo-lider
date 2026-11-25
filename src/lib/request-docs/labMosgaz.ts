import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import { formatDate } from "@/lib/format";
import { mskToday } from "@/lib/dates";
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

/** Получатель факсограммы Лаб. МГ (как в образцах УЭГНД). */
export const LAB_MOSGAZ_RECIPIENT_LINES = [
  "Начальнику Управления",
  "ЭГНД АО «МОСГАЗ»",
  "Е.А. Визгаловой",
] as const;

export const LAB_MOSGAZ_ORG = "ООО «ЛИДЕР»";
export const LAB_MOSGAZ_DIRECTOR = LIDER_DIRECTOR;

const MONTHS_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

/** «01 июля 2026 года» из YYYY-MM-DD. */
export function formatLongRuDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const month = MONTHS_RU[(m ?? 1) - 1] ?? "";
  return `${String(d).padStart(2, "0")} ${month} ${y} года`;
}

export type LabMosgazObjectCtx = {
  name: string;
  address: string;
  projectNumber: string;
};

export type LabMosgazFillInput = {
  outNumber: string;
  letterDate: string; // YYYY-MM-DD
  objectName: string;
  projectNumber: string;
  workTypes: string;
  pickets: string;
  callDate: string;
  callTime: string;
  address: string;
  responsible: string;
  note: string;
  /** Строка подвала «Исполнитель: …» */
  performer: string;
  /** Свободный текст письма (правка в превью); если задан — не пересобираем из полей. */
  letterOverride?: string | null;
};

export function buildLabMosgazFillInput(args: {
  requestNumber: number | string;
  callDate: string;
  values: { label: string; value: unknown }[];
  fields: { label: string; default_value: unknown }[];
  objectCtx: LabMosgazObjectCtx;
}): LabMosgazFillInput {
  const callTime = valueOrDefault(args.values, args.fields, "Время вызова");
  const workTypes = valueOrDefault(args.values, args.fields, "Виды работ");
  const responsible = valueOrDefault(args.values, args.fields, "Ответственный за производство работ");
  const pickets = valueOrDefault(args.values, args.fields, "Пикеты (от – до)");
  const note = valueOrDefault(args.values, args.fields, "Примечание");
  const outRaw = valueOrDefault(args.values, args.fields, "Исх. №");
  const performerRaw = valueOrDefault(args.values, args.fields, "Исполнитель");

  if (!pickets.trim()) throw new Error("Укажите «Пикеты (от – до)»");
  if (!callTime.trim()) throw new Error("Укажите «Время вызова»");
  if (!workTypes.trim()) throw new Error("Укажите «Виды работ»");
  if (!responsible.trim()) throw new Error("Укажите ответственного за производство работ");

  return {
    outNumber: outRaw.trim() || String(args.requestNumber),
    letterDate: mskToday(),
    objectName: args.objectCtx.name,
    projectNumber: args.objectCtx.projectNumber,
    workTypes: workTypes.trim(),
    pickets: pickets.trim(),
    callDate: args.callDate,
    callTime: normalizeCallTime(callTime),
    address: args.objectCtx.address,
    responsible: responsible.trim(),
    note: note.trim(),
    performer: performerRaw.trim() || DEFAULT_PERFORMER,
  };
}

/** Строки превью (карточка) + текст факсограммы. */
export function labMosgazPreviewRows(input: LabMosgazFillInput): { label: string; value: string }[] {
  return [
    { label: "Исх. №", value: input.outNumber },
    { label: "Дата исходящего", value: formatDate(input.letterDate) },
    { label: "Кому", value: LAB_MOSGAZ_RECIPIENT_LINES.join(", ") },
    { label: "Объект", value: input.objectName },
    { label: "Заказ / № проекта", value: input.projectNumber },
    { label: "Виды работ", value: input.workTypes },
    { label: "Пикеты", value: input.pickets },
    {
      label: "Дата и время встречи",
      value: `${formatLongRuDate(input.callDate)} в ${input.callTime}`,
    },
    { label: "Адрес", value: input.address },
    { label: "Представитель", value: input.responsible },
    { label: "Примечание", value: input.note },
  ];
}

export function labMosgazLetterBody(input: LabMosgazFillInput): string {
  if (input.letterOverride != null && input.letterOverride.trim() !== "") {
    return input.letterOverride.trim();
  }
  const order = input.projectNumber.trim()
    ? ` Заказ № ${input.projectNumber.replace(/^№\s*/i, "")}.`
    : "";
  return [
    `${LAB_MOSGAZ_ORG} выполняет строительно-монтажные работы на объекте: «${input.objectName}».${order}`,
    "",
    `Просим Вас направить ответственного представителя на ${input.workTypes} ${input.pickets}.`,
    `Дата, время и место встречи: ${formatLongRuDate(input.callDate)} в ${input.callTime} по адресу: ${input.address || "—"}.`,
    `Представитель: ${input.responsible}.`,
    input.note ? `\nПримечание: ${input.note}` : "",
  ]
    .filter((x, i, a) => !(x === "" && a[i - 1] === ""))
    .join("\n")
    .trim();
}

/** Собрать письмо заново из полей (сбрасывает ручную правку текста). */
export function labMosgazRebuildLetter(input: LabMosgazFillInput): string {
  return labMosgazLetterBody({ ...input, letterOverride: null });
}

export async function fillLabMosgazDocx(input: LabMosgazFillInput): Promise<ArrayBuffer> {
  const body = labMosgazLetterBody(input);
  const [letterhead, stamp, sign] = await Promise.all([
    loadLetterheadPng(),
    loadStampPng(),
    loadSignPng(),
  ]);
  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { ...LETTERHEAD_PAGE_MARGINS } },
        },
        headers: {
          default: buildLetterheadHeader(letterhead),
        },
        footers: {
          default: buildPerformerFooter(input.performer || DEFAULT_PERFORMER),
        },
        children: [
          new Paragraph({ children: [] }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Исх. № ${input.outNumber} от ${formatLongRuDate(input.letterDate)}`,
                bold: true,
                font: "Times New Roman",
                size: 28,
              }),
            ],
          }),
          new Paragraph({ children: [] }),
          ...LAB_MOSGAZ_RECIPIENT_LINES.map(
            (line) =>
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: line, bold: true, font: "Times New Roman", size: 28 }),
                ],
              }),
          ),
          new Paragraph({ children: [] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "ФАКСОГРАММА", bold: true, font: "Times New Roman", size: 28 }),
            ],
          }),
          new Paragraph({ children: [] }),
          ...body.split("\n").map(
            (line) =>
              new Paragraph({
                spacing: { after: 120, line: 360 },
                children: [
                  new TextRun({ text: line || " ", font: "Times New Roman", size: 28 }),
                ],
              }),
          ),
          new Paragraph({ children: [] }),
          buildDirectorTable({
            director: LAB_MOSGAZ_DIRECTOR,
            stamp,
            sign,
          }),
        ],
      },
    ],
  });

  return Packer.toArrayBuffer(doc);
}

export function labMosgazFileName(requestNumber: number | string, callDate: string) {
  const d = callDate ? formatDate(callDate).replace(/\./g, "-") : "без-даты";
  return `Лаб_МГ_заявка_${requestNumber}_${d}.docx`;
}
