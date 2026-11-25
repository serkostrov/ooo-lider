import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  convertInchesToTwip,
} from "docx";

/** Фирменный фон страницы из образцов Word (логотип + геометрия). */
export const LETTERHEAD_BG_URL = "/templates/letterhead/page-bg.png";
export const LETTERHEAD_STAMP_URL = "/templates/letterhead/stamp-or-sign1.png";
export const LETTERHEAD_SIGN_URL = "/templates/letterhead/stamp-or-sign2.png";

/** Как в образцах: сначала название, потом реквизиты. */
export const LIDER_COMPANY_NAME = "Общество с ограниченной ответственностью «Лидер»";
export const LIDER_REQUISITES = "ИНН 9725096659 КПП 772501001 ОГРН 1227700597057";
export const LIDER_DIRECTOR = "Хашагульгов М.А.";

/** Как в подвале образцов Word. */
export const DEFAULT_PERFORMER = "Согоян М.Г., тел.: 8-967-045-60-62";

export function formatPerformerLine(performer: string): string {
  const t = performer.trim();
  if (!t) return `Исполнитель: ${DEFAULT_PERFORMER}`;
  return t.toLowerCase().startsWith("исполнитель") ? t : `Исполнитель: ${t}`;
}

/** Размер PNG ≈ A4. */
export const LETTERHEAD_PX = { width: 794, height: 1123 } as const;

/**
 * Поля страницы (twips).
 * top — ниже логотипа и двух строк шапки (название + ИНН).
 */
export const LETTERHEAD_PAGE_MARGINS = {
  top: 2460, // тело как было; ниже двигаем только шапку
  right: 707,
  bottom: 720,
  left: 1134,
  header: 280,
  footer: 480, // исполнитель выше декоративной полосы внизу PNG
} as const;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
export const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
} as const;
/** Без рамок на уровне таблицы — иначе docx ставит дефолтную сетку. */
const TABLE_NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
} as const;

let cachedBg: Uint8Array | null = null;
let cachedStamp: Uint8Array | null = null;
let cachedSign: Uint8Array | null = null;

async function loadPng(url: string, label: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить ${label}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadLetterheadPng(): Promise<Uint8Array> {
  if (cachedBg) return cachedBg;
  cachedBg = await loadPng(LETTERHEAD_BG_URL, "фирменный бланк ООО «Лидер»");
  return cachedBg;
}

export async function loadStampPng(): Promise<Uint8Array> {
  if (cachedStamp) return cachedStamp;
  cachedStamp = await loadPng(LETTERHEAD_STAMP_URL, "печать");
  return cachedStamp;
}

export async function loadSignPng(): Promise<Uint8Array> {
  if (cachedSign) return cachedSign;
  cachedSign = await loadPng(LETTERHEAD_SIGN_URL, "подпись");
  return cachedSign;
}

/**
 * Header: фон (логотип + геометрия) + текст как в образце:
 * 1) Общество с ограниченной ответственностью «Лидер»
 * 2) ИНН … КПП … ОГРН …
 */
export function buildLetterheadHeader(png: Uint8Array): Header {
  return new Header({
    children: [
      new Paragraph({
        spacing: { after: 0, before: 0, line: 20 },
        children: [
          new ImageRun({
            type: "png",
            data: png,
            transformation: { ...LETTERHEAD_PX },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                align: HorizontalPositionAlign.LEFT,
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                offset: 0,
              },
              behindDocument: true,
              allowOverlap: true,
              wrap: { type: TextWrappingType.NONE },
            },
          }),
        ],
      }),
      // Шапка (название + ИНН) чуть ниже логотипа.
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: convertInchesToTwip(0.95), after: 40, line: 240 },
        children: [
          new TextRun({
            text: LIDER_COMPANY_NAME,
            bold: true,
            font: "Times New Roman",
            size: 18,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40, line: 240 },
        children: [
          new TextRun({
            text: LIDER_REQUISITES,
            font: "Times New Roman",
            size: 16,
          }),
        ],
      }),
    ],
  });
}

/** Подвал: исполнитель, как в образцах. */
export function buildPerformerFooter(performer: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: formatPerformerLine(performer),
            font: "Times New Roman",
            size: 16,
          }),
        ],
      }),
    ],
  });
}

/**
 * Блок подписи как в образце Word:
 * Директор / М.П. | крупная печать + роспись поверх линии ______ | / ФИО /
 */
export function buildDirectorTable(args: {
  director?: string;
  stamp: Uint8Array;
  sign: Uint8Array;
}): Table {
  const director = args.director ?? LIDER_DIRECTOR;
  // Пропорции как в АНПИ Интеграл.docx (~3072 / 4546 / 3156).
  const cols = [2850, 4220, 2930] as const;

  return new Table({
    width: { size: 10000, type: WidthType.DXA },
    columnWidths: [...cols],
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: cols[0], type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 0, right: 40 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 0, after: 0, line: 276 },
                children: [
                  new TextRun({
                    text: "Директор",
                    bold: true,
                    font: "Times New Roman",
                    size: 28,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: cols[1], type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { before: 200, after: 0, line: 276 },
                children: [
                  new ImageRun({
                    type: "png",
                    data: args.stamp,
                    transformation: { width: 183, height: 174 },
                    floating: {
                      horizontalPosition: {
                        relative: HorizontalPositionRelativeFrom.COLUMN,
                        offset: -857589,
                      },
                      verticalPosition: {
                        relative: VerticalPositionRelativeFrom.PARAGRAPH,
                        offset: -514960,
                      },
                      allowOverlap: true,
                      wrap: { type: TextWrappingType.NONE },
                    },
                  }),
                  new ImageRun({
                    type: "png",
                    data: args.sign,
                    transformation: { width: 156, height: 99 },
                    floating: {
                      horizontalPosition: {
                        relative: HorizontalPositionRelativeFrom.COLUMN,
                        offset: 476250,
                      },
                      verticalPosition: {
                        relative: VerticalPositionRelativeFrom.PARAGRAPH,
                        offset: -330835,
                      },
                      allowOverlap: true,
                      wrap: { type: TextWrappingType.NONE },
                    },
                  }),
                  new TextRun({
                    text: "______________________________",
                    font: "Times New Roman",
                    size: 28,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: cols[2], type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 0, left: 40, right: 0 },
            children: [
              new Paragraph({
                spacing: { before: 200, after: 0, line: 276 },
                children: [
                  new TextRun({
                    text: `/ ${director}/`,
                    bold: true,
                    font: "Times New Roman",
                    size: 28,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: cols[0], type: WidthType.DXA },
            borders: NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 40 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 0, after: 0, line: 276 },
                children: [
                  new TextRun({
                    text: "М.П.",
                    bold: true,
                    font: "Times New Roman",
                    size: 28,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: cols[1], type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: cols[2], type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [new Paragraph({ children: [] })],
          }),
        ],
      }),
    ],
  });
}
