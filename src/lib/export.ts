import { toast } from "sonner";
import * as XLSX from "xlsx";

export type Column<T> = { header: string; value: (row: T) => string | number | null | undefined; width?: number };

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "выгрузка";
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type SheetSpec<T> = {
  name: string;
  columns: Column<T>[];
  rows: T[];
};

function sheetToAoa<T>(columns: Column<T>[], rows: T[]): (string | number)[][] {
  return [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r) ?? ""))];
}

function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = (raw.trim().slice(0, 31) || "Лист").replace(/[:\\/?*\[\]]/g, " ");
  let name = base;
  let i = 2;
  while (used.has(name)) {
    const suffix = ` (${i})`;
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(name);
  return name;
}

function fallbackCsv<T>(fileName: string, sheets: SheetSpec<T>[]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const first = sheets[0];
  if (!first) return;
  const aoa = sheetToAoa(first.columns, first.rows);
  const csv = "﻿" + aoa.map((r) => r.map(esc).join(";")).join("\r\n");
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${safeFileName(fileName)}.csv`);
  toast.info(
    sheets.length > 1
      ? "Не удалось записать Excel — выгружен CSV только первого листа"
      : "Не удалось записать Excel — выгружен CSV, он открывается в Excel",
  );
}

/** Выгрузка в .xlsx с несколькими листами. */
export async function exportXlsxSheets<T>(fileName: string, sheets: SheetSpec<T>[]) {
  if (sheets.length === 0) return;
  try {
    const wb = XLSX.utils.book_new();
    const used = new Set<string>();
    for (const sheet of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(sheetToAoa(sheet.columns, sheet.rows));
      ws["!cols"] = sheet.columns.map((c) => ({ wch: c.width ?? 18 }));
      XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(sheet.name, used));
    }
    XLSX.writeFile(wb, `${safeFileName(fileName)}.xlsx`);
  } catch {
    fallbackCsv(fileName, sheets);
  }
}

/**
 * Выгрузка в .xlsx (SheetJS, ТЗ 7.5).
 * Если запись файла недоступна — CSV с BOM, который Excel открывает с кириллицей.
 */
export async function exportXlsx<T>(fileName: string, sheetName: string, columns: Column<T>[], rows: T[]) {
  await exportXlsxSheets(fileName, [{ name: sheetName, columns, rows }]);
}

const escHtml = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

/** Печать того же списка: отдельное окно с таблицей и диалог печати браузера. */
export function printTable<T>(title: string, subtitle: string, columns: Column<T>[], rows: T[]) {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Браузер заблокировал окно печати — разрешите всплывающие окна");
    return;
  }
  const head = columns.map((c) => `<th>${escHtml(c.header)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${escHtml(c.value(r)).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`)
    .join("");
  /* Print всегда светлая палитра — независимо от тёмной темы приложения */
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
  body{font-family:"Onest",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;margin:16px;color:#1c2126;background:#fff}
  h1{font-size:18px;margin:0 0 4px;letter-spacing:-0.01em} p{margin:0 0 12px;color:#5a6470;font-size:12px}
  table{border-collapse:collapse;width:100%;font-size:11px}
  th,td{border:1px solid #c5ccd4;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#eef1f4;font-weight:600} tr{page-break-inside:avoid}
  @page{size:A4 landscape;margin:10mm}
</style></head><body>
<h1>${escHtml(title)}</h1><p>${escHtml(subtitle)}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  w.document.close();
}
