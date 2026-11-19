import { useMemo } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { exportXlsx, printTable, type Column } from "@/lib/export";
import { useObjectConditions, type ObjectStage, type StageCondition } from "./data";

type ExportRow = ObjectStage & { conditions_list: string };

/** Колонки перечня этапов (ТЗ: условия, сроки, статусы, исполнители). */
function columns(): Column<ExportRow>[] {
  return [
    { header: "N", value: (s) => s.code || s.number, width: 8 },
    {
      header: "Название этапа",
      value: (s) =>
        s.name +
        (s.is_critical ? " (критичный)" : "") +
        (s.parent_id && s.parent_code ? ` [подэтап ${s.parent_code}]` : ""),
      width: 45,
    },
    { header: "От нас", value: (s) => s.outgoing_doc, width: 18 },
    { header: "Ждём", value: (s) => s.expected_doc, width: 18 },
    {
      header: "Условия (готово)",
      value: (s) => (s.conditions_total ? `${s.conditions_done} из ${s.conditions_total}` : ""),
      width: 12,
    },
    { header: "Условия (список)", value: (s) => s.conditions_list, width: 40 },
    { header: "Дата начала", value: (s) => formatDate(s.start_date), width: 12 },
    { header: "Дата (срок)", value: (s) => formatDate(s.due_date), width: 12 },
    { header: "Ответ ждём до", value: (s) => formatDate(s.response_due), width: 12 },
    { header: "Статус", value: (s) => (s.is_excluded ? "Исключён" : s.status_name), width: 16 },
    { header: "Исполнитель", value: (s) => s.executor_name ?? "не назначен", width: 22 },
    { header: "Адресат", value: (s) => s.confirmer_name ?? s.confirmer_role_name, width: 20 },
    { header: "Примечание", value: (s) => s.note, width: 35 },
  ];
}

function condLine(c: StageCondition) {
  const mark = c.is_done ? "✓" : "○";
  return `${mark} ${c.title}`;
}

export function StagesExport({ objectName, stages }: { objectName: string; stages: ObjectStage[] }) {
  const today = formatDate(mskToday());
  const ids = stages.map((s) => s.id);
  const objectId = stages[0]?.object_id ?? "";
  const { data: conditions = [] } = useObjectConditions(objectId, ids);

  const rows = useMemo<ExportRow[]>(() => {
    const byStage: Record<string, StageCondition[]> = {};
    for (const c of conditions) (byStage[c.stage_id] ??= []).push(c);
    return stages.map((s) => ({
      ...s,
      conditions_list: (byStage[s.id] ?? [])
        .slice()
        .sort((a, b) => a.sort - b.sort)
        .map(condLine)
        .join("\n"),
    }));
  }, [stages, conditions]);

  const cols = columns();

  return (
    <>
      <Button
        variant="outline"
        title="Excel"
        aria-label="Excel"
        className="h-8 gap-1.5 px-2.5 text-sm"
        disabled={stages.length === 0}
        onClick={() => exportXlsx(`Этапы — ${objectName} — ${today}`, "Этапы", cols, rows)}
      >
        <FileSpreadsheet className="size-3.5 shrink-0" />
        <span className="hidden sm:inline">Excel</span>
      </Button>
      <Button
        variant="outline"
        title="Печать"
        aria-label="Печать"
        className="h-8 gap-1.5 px-2.5 text-sm"
        disabled={stages.length === 0}
        onClick={() =>
          printTable(
            `Этапы — ${objectName}`,
            `Сформировано ${today}. Этапов в списке: ${stages.length}`,
            cols,
            rows,
          )
        }
      >
        <Printer className="size-3.5 shrink-0" />
        <span className="hidden sm:inline">Печать</span>
      </Button>
    </>
  );
}
