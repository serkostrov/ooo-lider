import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDate, showError } from "@/lib/format";
import { openFile } from "@/lib/files";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import {
  systemValue,
  useRegistryDelete,
  useRegistryJournalFields,
  type RegistryEntry,
  type RegistryJournalField,
} from "./data";

function clip(s: string | null | undefined, n = 120) {
  const t = (s ?? "").trim();
  if (!t) return "—";
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function cellText(entry: RegistryEntry, field: RegistryJournalField) {
  const raw = systemValue(entry, field);
  if (!raw.trim()) return "—";
  if (field.field_type === "date") return formatDate(raw);
  return clip(raw, field.field_type === "textarea" ? 160 : 80);
}

export function RegistryTable({
  journalId,
  rows,
}: {
  journalId: string;
  rows: RegistryEntry[];
}) {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const canEdit = is_admin;
  const del = useRegistryDelete();
  const { data: fields = [] } = useRegistryJournalFields(journalId);

  const tableFields = useMemo(
    () => fields.filter((f) => f.show_in_table),
    [fields],
  );

  const openEntry = (row: RegistryEntry) => {
    void navigate({
      to: "/registry/$entryId",
      params: { entryId: row.id },
    });
  };

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Пока нет записей. Они появятся при отправке заявок или добавьте вручную.
      </p>
    );
  }

  const th =
    "px-2 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
  const td = "px-2 py-2.5 align-middle text-sm";
  const thC = cn(th, "text-center");
  const thL = cn(th, "text-left");
  const tdC = cn(td, "text-center");
  const tdL = cn(td, "text-left");

  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className={cn(thC, "w-12")}>№</th>
            {tableFields.map((f) => (
              <th
                key={f.id}
                className={
                  f.field_type === "date" || f.system_key === "in_letter_no" ? thC : thL
                }
              >
                {f.label}
              </th>
            ))}
            <th className={cn(thC, "w-28")}>Заявка</th>
            {canEdit ? <th className={cn(thC, "w-[5.5rem]")} /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              role="button"
              tabIndex={0}
              title="Открыть запись"
              className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/20"
              onClick={() => openEntry(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEntry(row);
                }
              }}
            >
              <td className={cn(tdC, "tabular-nums text-muted-foreground")}>{row.number}</td>
              {tableFields.map((f) => {
                const centered =
                  f.field_type === "date" || f.system_key === "in_letter_no";
                return (
                  <td
                    key={f.id}
                    className={cn(
                      centered ? tdC : tdL,
                      (f.field_type === "textarea" ||
                        f.system_key === "out_content" ||
                        f.system_key === "in_content") &&
                        "whitespace-pre-wrap break-words",
                    )}
                  >
                    {cellText(row, f)}
                  </td>
                );
              })}
              <td
                className={tdC}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center gap-1">
                  {row.request_id && row.request_number != null ? (
                    <button
                      type="button"
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      title={
                        row.out_doc_path
                          ? "Открыть отправленный бланк"
                          : "Открыть карточку заявки"
                      }
                      onClick={() => {
                        if (row.out_doc_path) {
                          void openFile(row.out_doc_path).catch(showError);
                          return;
                        }
                        void navigate({
                          to: "/requests/$requestId",
                          params: { requestId: row.request_id! },
                        });
                      }}
                    >
                      №{row.request_number}
                    </button>
                  ) : (
                    <span className="text-sm font-medium">вручную</span>
                  )}
                  {row.object_name ? (
                    <span className="line-clamp-2 text-center text-[11px] text-muted-foreground">
                      {row.object_name}
                    </span>
                  ) : null}
                </div>
              </td>
              {canEdit ? (
                <td
                  className={tdC}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center justify-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title="Изменить"
                      onClick={() => openEntry(row)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-danger"
                      title="Удалить"
                      disabled={del.isPending}
                      onClick={() => {
                        if (!confirm(`Удалить запись №${row.number}?`)) return;
                        del.mutate(
                          { id: row.id, journalId },
                          {
                            onSuccess: () => toast.success("Удалено"),
                            onError: showError,
                          },
                        );
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
