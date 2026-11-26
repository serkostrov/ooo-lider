import { formatDate } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { exportXlsxSheets, printTable, type Column } from "@/lib/export";
import {
  systemValue,
  type RegistryEntry,
  type RegistryJournalField,
} from "./data";

export type RegistryExportSheet = {
  name: string;
  fields: RegistryJournalField[];
  rows: RegistryEntry[];
};

function exportColumns(fields: RegistryJournalField[]): Column<RegistryEntry>[] {
  const tableFields = fields.filter((f) => f.show_in_table);
  return [
    { header: "№", value: (r) => r.number, width: 8 },
    ...tableFields.map((f) => ({
      header: f.label,
      value: (r: RegistryEntry) => {
        const raw = systemValue(r, f).trim();
        if (!raw) return "";
        if (f.field_type === "date") return formatDate(raw);
        return raw;
      },
      width: f.field_type === "textarea" ? 40 : f.field_type === "date" ? 12 : 22,
    })),
    {
      header: "Заявка",
      value: (r) => (r.request_number != null ? `№${r.request_number}` : "вручную"),
      width: 12,
    },
    { header: "Объект", value: (r) => r.object_name ?? "", width: 28 },
  ];
}

/** Один файл: каждый журнал — отдельный лист. */
export function exportRegistryExcel(sheets: RegistryExportSheet[]) {
  if (sheets.length === 0) return;
  const today = formatDate(mskToday());
  void exportXlsxSheets(
    `Реестр — ${today}`,
    sheets.map((s) => ({
      name: s.name,
      columns: exportColumns(s.fields),
      rows: s.rows,
    })),
  );
}

export function printRegistry(args: {
  journalName: string;
  fields: RegistryJournalField[];
  rows: RegistryEntry[];
}) {
  const today = formatDate(mskToday());
  printTable(
    `Реестр — ${args.journalName}`,
    `Сформировано ${today}. Записей в списке: ${args.rows.length}`,
    exportColumns(args.fields),
    args.rows,
  );
}
