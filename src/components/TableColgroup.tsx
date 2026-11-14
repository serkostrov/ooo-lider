import type { ColumnWidthDef, ColumnWidths } from "@/lib/table-column-widths";

/** <colgroup>: доли от суммы ширин — таблица всегда тянется на 100% контейнера. */
export function TableColgroup({
  columns,
  widths,
}: {
  columns: ColumnWidthDef[];
  widths: ColumnWidths;
}) {
  const total = columns.reduce((sum, c) => sum + (widths[c.id] ?? c.defaultWidth), 0) || 1;
  return (
    <colgroup>
      {columns.map((c) => {
        const w = widths[c.id] ?? c.defaultWidth;
        return <col key={c.id} style={{ width: `${(w / total) * 100}%` }} />;
      })}
    </colgroup>
  );
}
