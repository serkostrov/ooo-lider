/** Модель бланка конструктора (хранимая в request_blank_templates.config). */

export type BlankFormat = "word_table" | "word_fax" | "excel" | "message";

/** Код генератора файла (пока жёсткие движки в коде). */
export type BlankEngine =
  | "technadzor_xlsx"
  | "lab_mosgaz_table_docx"
  | "lab_mosgaz_docx"
  | "lab_integral_docx"
  | "geotrest_message";

export const BLANK_ENGINES: { v: BlankEngine; label: string; format: BlankFormat }[] = [
  { v: "technadzor_xlsx", label: "Технадзор (Excel)", format: "excel" },
  { v: "lab_mosgaz_table_docx", label: "Лаборатория МГ — таблица (Word)", format: "word_table" },
  { v: "lab_mosgaz_docx", label: "Лаборатория МГ — факс (Word)", format: "word_fax" },
  { v: "lab_integral_docx", label: "Лаборатория Интеграл (Word)", format: "word_table" },
  { v: "geotrest_message", label: "Геотрест — сообщение", format: "message" },
];

export function defaultEngineForFormat(format: BlankFormat | null): BlankEngine | null {
  if (!format) return null;
  return BLANK_ENGINES.find((e) => e.format === format)?.v ?? null;
}

export type FieldSourceKind = "field" | "constant" | "object";

export type TableRowConfig = {
  id: string;
  title: string;
  sourceKind: FieldSourceKind;
  /** label поля / ключ объекта / константа */
  sourceValue: string;
};

export type ExcelColumnConfig = {
  id: string;
  title: string;
  sourceKind: FieldSourceKind;
  sourceValue: string;
};

export type BlankConfig = {
  format: BlankFormat | null;
  letterhead: boolean;
  recipientLines: string[];
  showDirectorBlock: boolean;
  /** Word-таблица */
  tableRows: TableRowConfig[];
  /** Word-факс */
  faxTitle: string;
  faxBody: string;
  /** Excel */
  excelColumns: ExcelColumnConfig[];
  /** Сообщение (Геотрест / Max) */
  messageTemplate: string;
};

export const BLANK_FORMATS: { v: BlankFormat; label: string; hint: string }[] = [
  {
    v: "word_table",
    label: "Word — таблица",
    hint: "Интеграл / Мосгаз: шапка + строки № / заголовок / значение",
  },
  {
    v: "word_fax",
    label: "Word — факс",
    hint: "УЭГНД/ГВСД: «Кому» + ФАКСОГРАММА + свободный текст",
  },
  {
    v: "excel",
    label: "Excel",
    hint: "Технадзор: одна строка колонок",
  },
  {
    v: "message",
    label: "Сообщение",
    hint: "Геотрест / Max: текст с плейсхолдерами {{поле}}",
  },
];

export function formatLabel(format: BlankFormat | null): string {
  if (!format) return "—";
  return BLANK_FORMATS.find((f) => f.v === format)?.label ?? format;
}

export const SAMPLE_FIELD_OPTIONS = [
  "Дата вызова",
  "Время вызова",
  "Метод контроля",
  "Нормы контроля",
  "Условия / виды работ",
  "Виды работ",
  "Типоразмер и пикеты",
  "Пикеты (от – до)",
  "Пикеты (от–до)",
  "Ответственный за производство работ",
  "Ответственный на объекте",
  "Коммуникация и объём",
  "Точный адрес для вызова",
  "Вид вызова",
  "Что нужно",
  "Примечание",
  "Исх. №",
  "Исполнитель",
  "Номер и дата регистрации проекта в УТН",
  "Шифр и наименование объекта",
] as const;

export const SAMPLE_OBJECT_OPTIONS = [
  { v: "Название объекта", label: "Название объекта" },
  { v: "Адрес объекта", label: "Адрес объекта" },
  { v: "Шифр / номер проекта", label: "Шифр / номер проекта" },
  { v: "Номер УТН", label: "Номер УТН" },
  { v: "Дата УТН", label: "Дата УТН" },
  { v: "Регистрация проекта в УТН", label: "Регистрация проекта в УТН" },
  { v: "Дата и время вызова", label: "Дата и время вызова" },
  { v: "Типоразмер и пикеты", label: "Типоразмер и пикеты (с пикетами)" },
  { v: "Заказчик", label: "Заказчик объекта" },
  { v: "Инспектор технадзора", label: "Инспектор технадзора" },
  { v: "Шифр и наименование объекта", label: "Шифр + название объекта" },
  { v: "Строка вызова Геотрест", label: "Строка вызова Геотрест" },
] as const;

export type PlaceholderGroup = "Поля заявки" | "Объект";

/** Подсказки для {{…}} в тексте факса / сообщения. */
export const PLACEHOLDER_SUGGESTIONS: {
  key: string;
  label: string;
  group: PlaceholderGroup;
}[] = [
  ...SAMPLE_FIELD_OPTIONS.map((key) => ({
    key,
    label: key,
    group: "Поля заявки" as const,
  })),
  ...SAMPLE_OBJECT_OPTIONS.map((o) => ({
    key: o.v,
    label: o.label,
    group: "Объект" as const,
  })),
];

export const DEMO_VALUES: Record<string, string> = {
  "Дата вызова": "25.11.2026",
  "Время вызова": "10:00",
  "Дата и время вызова": "25.11.2026 10-00",
  "Метод контроля": "Ультразвуковой / Радиографический",
  "Нормы контроля": "СП 42-102-2004, СП 62.13330.2011",
  "Условия / виды работ": "Просим произвести просвет стыков с получением результатов на месте",
  "Виды работ": "Контроль качества сварных стыков",
  "Типоразмер и пикеты": "Ø159×4,5; ПК0+00 — ПК1+20",
  "Пикеты (от – до)": "ПК0+00 — ПК1+20",
  "Пикеты (от–до)": "ПК0+00 — ПК1+20",
  "Ответственный за производство работ": "Иванов И.И., +7 900 000-00-00",
  "Ответственный на объекте": "Иванов И.И., +7 900 000-00-00",
  "Что нужно": "Контроль качества сварных стыков",
  "Коммуникация и объём": "Газопровод Ø159, 12 стыков",
  "Точный адрес для вызова": "Дмитровское ш., вл. 9",
  "Вид вызова": "КГС",
  "Примечание": "",
  "Исх. №": "42",
  "Исполнитель": "Петров П.П.",
  "Номер и дата регистрации проекта в УТН": "№441 от 01.11.2026 г.",
  "Шифр и наименование объекта": "ГП-2026/09 Газопровод к котельной",
  "Название объекта": "Газопровод к котельной",
  "Адрес объекта": "Дмитровское ш., вл. 9",
  "Шифр / номер проекта": "ГП-2026/09",
  "Номер УТН": "441",
  "Дата УТН": "01.11.2026",
  "Регистрация проекта в УТН": "№441 от 01.11.2026 г.",
  "Заказчик": "АО «МОСГАЗ»",
  "Инспектор технадзора": "Сидоров С.С.",
  "Строка вызова Геотрест": "КГС на 25.11.2026",
  // старые ключи — на случай уже сохранённых шаблонов
  name: "Газопровод к котельной",
  address: "Дмитровское ш., вл. 9",
  project_number: "ГП-2026/09",
  utn_number: "УТН-441",
};

export const STORAGE_KEY = "lider.blank-constructor.v1";

function rid() {
  return crypto.randomUUID();
}

export function defaultConfig(format: BlankFormat | null = null): BlankConfig {
  return {
    format,
    letterhead: true,
    recipientLines: ["Начальнику УЭГНД", "Иванову И.И."],
    showDirectorBlock: true,
    tableRows: [
      {
        id: rid(),
        title: "Объект",
        sourceKind: "object",
        sourceValue: "Название объекта",
      },
      {
        id: rid(),
        title: "Адрес",
        sourceKind: "object",
        sourceValue: "Адрес объекта",
      },
      {
        id: rid(),
        title: "Дата вызова",
        sourceKind: "field",
        sourceValue: "Дата вызова",
      },
      {
        id: rid(),
        title: "Что требуется",
        sourceKind: "field",
        sourceValue: "Что нужно",
      },
    ],
    faxTitle: "ФАКСОГРАММА",
    faxBody:
      "Просим направить представителя лаборатории для контроля качества сварных стыков.\n\nДата: {{Дата вызова}}\nАдрес: {{Адрес объекта}}\nОбъём: {{Коммуникация и объём}}",
    excelColumns: [
      { id: rid(), title: "№ заявки", sourceKind: "constant", sourceValue: "42" },
      { id: rid(), title: "Дата", sourceKind: "field", sourceValue: "Дата вызова" },
      { id: rid(), title: "Объект", sourceKind: "object", sourceValue: "Название объекта" },
      { id: rid(), title: "Адрес", sourceKind: "object", sourceValue: "Адрес объекта" },
      {
        id: rid(),
        title: "Ответственный",
        sourceKind: "field",
        sourceValue: "Ответственный на объекте",
      },
    ],
    messageTemplate: [
      "1. Дата, на которую нужно вызвать: {{Вид вызова}} на {{Дата вызова}}",
      "2. Шифр и полное наименование объекта: {{Шифр / номер проекта}} {{Название объекта}}",
      "3. Коммуникация и объем: {{Коммуникация и объём}}",
      "4. Точный адрес для вызова: {{Точный адрес для вызова}}",
      "5. Ответственный на объекте и его номер: {{Ответственный на объекте}}",
    ].join("\n"),
  };
}

export function resolveSource(
  kind: FieldSourceKind,
  value: string,
  demo: Record<string, string> = DEMO_VALUES,
): string {
  if (kind === "constant") return value || "—";
  return demo[value]?.trim() || `{{${value}}}`;
}

export function renderTemplate(
  template: string,
  demo: Record<string, string> = DEMO_VALUES,
): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => {
    const k = key.trim();
    return demo[k] ?? `{{${k}}}`;
  });
}

export function loadStoredConfig(): BlankConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BlankConfig;
    if (!parsed || typeof parsed !== "object") return null;
    return { ...defaultConfig(), ...parsed };
  } catch {
    return null;
  }
}

export function saveStoredConfig(config: BlankConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota */
  }
}
