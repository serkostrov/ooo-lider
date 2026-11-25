import type { BlankConfig, BlankEngine, ExcelColumnConfig, TableRowConfig } from "./types";
import { LAB_INTEGRAL_BUILDER, LAB_INTEGRAL_RECIPIENT, LAB_MOSGAZ_TABLE_RECIPIENT } from "@/lib/request-docs/labIntegral";
import { LAB_MOSGAZ_RECIPIENT_LINES } from "@/lib/request-docs/labMosgaz";
import { BUILDER_ORG } from "@/lib/request-docs/technadzor";

function rid() {
  return crypto.randomUUID();
}

function row(title: string, sourceKind: TableRowConfig["sourceKind"], sourceValue: string): TableRowConfig {
  return { id: rid(), title, sourceKind, sourceValue };
}

function col(title: string, sourceKind: ExcelColumnConfig["sourceKind"], sourceValue: string): ExcelColumnConfig {
  return { id: rid(), title, sourceKind, sourceValue };
}

/** Конфиг бланка, совпадающий с жёстким генератором (для конструктора и live). */
export function presetConfigForEngine(engine: BlankEngine): BlankConfig {
  switch (engine) {
    case "lab_integral_docx":
      return {
        format: "word_table",
        letterhead: true,
        recipientLines: [LAB_INTEGRAL_RECIPIENT],
        showDirectorBlock: true,
        tableRows: [
          row("Заказчик", "constant", LAB_INTEGRAL_BUILDER),
          row("Метод контроля качества", "field", "Метод контроля"),
          row("Дата и время проведения работ", "object", "Дата и время вызова"),
          row("Нормы, по которым необходимо производить контроль", "field", "Нормы контроля"),
          row("Условия выполнения контроля", "field", "Условия / виды работ"),
          row("Объект", "object", "Название объекта"),
          row(
            "Номер и дата регистрации проекта в Управлении технического надзора",
            "object",
            "Регистрация проекта в УТН",
          ),
          row("Точный фактический адрес контроля", "object", "Адрес объекта"),
          row(
            "Типоразмер и свойства контролируемых «изделий и/или элементов» и их точное количество в зависимости от метода контроля (диаметр, толщина, длина, пикеты, давление и др.)",
            "object",
            "Типоразмер и пикеты",
          ),
          row(
            "ФИО и контактные телефоны представителей заказчика на объекте",
            "field",
            "Ответственный за производство работ",
          ),
        ],
        faxTitle: "",
        faxBody: "",
        excelColumns: [],
        messageTemplate: "",
      };

    case "lab_mosgaz_table_docx":
      return {
        ...presetConfigForEngine("lab_integral_docx"),
        recipientLines: [LAB_MOSGAZ_TABLE_RECIPIENT],
      };

    case "lab_mosgaz_docx":
      return {
        format: "word_fax",
        letterhead: true,
        recipientLines: [...LAB_MOSGAZ_RECIPIENT_LINES],
        showDirectorBlock: true,
        tableRows: [],
        faxTitle: "ФАКСОГРАММА",
        faxBody: [
          "Просим направить представителя лаборатории для контроля качества сварных стыков.",
          "",
          "Объект: {{Название объекта}}",
          "Шифр / № проекта: {{Шифр / номер проекта}}",
          "Виды работ: {{Виды работ}}",
          "Пикеты: {{Пикеты (от – до)}}",
          "Дата и время: {{Дата и время вызова}}",
          "Адрес: {{Адрес объекта}}",
          "Ответственный: {{Ответственный за производство работ}}",
          "Примечание: {{Примечание}}",
        ].join("\n"),
        excelColumns: [],
        messageTemplate: "",
      };

    case "technadzor_xlsx":
      return {
        format: "excel",
        letterhead: false,
        recipientLines: [],
        showDirectorBlock: false,
        tableRows: [],
        faxTitle: "",
        faxBody: "",
        excelColumns: [
          col("Время вызова", "object", "Дата и время вызова"),
          col("Инспектор", "object", "Инспектор технадзора"),
          col("Заказчик", "object", "Заказчик"),
          col("Строительная организация", "constant", BUILDER_ORG),
          col("Ответственный за производство работ", "field", "Ответственный за производство работ"),
          col("Адрес объекта", "object", "Адрес объекта"),
          col("Виды работ", "field", "Виды работ"),
          col("№ проекта", "object", "Шифр / номер проекта"),
          col("Регистрация УТН №", "object", "Номер УТН"),
          col("Регистрация УТН дата", "object", "Дата УТН"),
          col("Примечание", "field", "Примечание"),
        ],
        messageTemplate: "",
      };

    case "geotrest_message":
      return {
        format: "message",
        letterhead: false,
        recipientLines: [],
        showDirectorBlock: false,
        tableRows: [],
        faxTitle: "",
        faxBody: "",
        excelColumns: [],
        messageTemplate: [
          "1. Дата, на которую нужно вызвать (направлять за 2 дня до вызова): {{Строка вызова Геотрест}}",
          "2. Шифр и полное наименование объекта: {{Шифр и наименование объекта}}",
          "3. Коммуникация и объем (который нужно отснять): {{Коммуникация и объём}}",
          "4. Точный адрес для вызова: {{Точный адрес для вызова}}",
          "5. Ответственный на объекте и его номер: {{Ответственный на объекте}}",
        ].join("\n"),
      };
  }
}

export function hasPresetRows(config: BlankConfig): boolean {
  if (config.format === "word_table") return config.tableRows.length > 0;
  if (config.format === "excel") return config.excelColumns.length > 0;
  if (config.format === "message") return config.messageTemplate.trim().length > 0;
  if (config.format === "word_fax") return config.faxBody.trim().length > 0;
  return false;
}
