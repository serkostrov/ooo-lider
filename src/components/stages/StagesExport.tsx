import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { exportXlsx, printTable, type Column } from "@/lib/export";
import type { ObjectStage } from "./data";

/** Колонки — как в таблице этапов на экране (ТЗ 7.5, критерий «колонки как на экране»). */
const COLUMNS: Column<ObjectStage>[] = [
  { header: "N", value: (s) => s.number, width: 5 },
  { header: "Название этапа", value: (s) => s.name + (s.is_critical ? " (критичный)" : ""), width: 45 },
  { header: "От нас", value: (s) => s.outgoing_doc, width: 18 },
  { header: "Ждём", value: (s) => s.expected_doc, width: 18 },
  { header: "Условия закрытия", value: (s) => (s.conditions_total ? `${s.conditions_done} из ${s.conditions_total}` : ""), width: 12 },
  { header: "Дата (срок)", value: (s) => formatDate(s.due_date), width: 12 },
  { header: "Ответ ждём до", value: (s) => formatDate(s.response_due), width: 12 },
  { header: "Статус", value: (s) => (s.is_excluded ? "Исключён" : s.status_name), width: 16 },
  { header: "Исполнитель", value: (s) => s.executor_name ?? "не назначен", width: 22 },
  { header: "Адресат", value: (s) => s.confirmer_name ?? s.confirmer_role_name, width: 20 },
  { header: "Примечание", value: (s) => s.note, width: 35 },
];

export function StagesExport({ objectName, stages }: { objectName: string; stages: ObjectStage[] }) {
  const today = formatDate(mskToday());
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        disabled={stages.length === 0}
        title="Выгрузить в Excel"
        aria-label="Выгрузить в Excel"
        onClick={() => exportXlsx(`Этапы — ${objectName} — ${today}`, "Этапы", COLUMNS, stages)}
      >
        <FileSpreadsheet className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        disabled={stages.length === 0}
        title="Печать"
        aria-label="Печать"
        onClick={() => printTable(`Этапы — ${objectName}`, `Сформировано ${today}. Этапов в списке: ${stages.length}`, COLUMNS, stages)}
      >
        <Printer className="size-4" />
      </Button>
    </>
  );
}
