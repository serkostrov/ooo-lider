import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, showError } from "@/lib/format";
import { openFile } from "@/lib/files";
import { systemValue, type RegistryEntry, type RegistryJournalField } from "./data";

export function RegistryEntryViewDialog({
  open,
  onOpenChange,
  entry,
  fields,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: RegistryEntry | null;
  fields: RegistryJournalField[];
}) {
  if (!entry) return null;

  const openSentBlank = () => {
    if (!entry.out_doc_path) {
      toast.info("Файл исходящего бланка ещё не сохранён");
      return;
    }
    void openFile(entry.out_doc_path).catch(showError);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Запись №{entry.number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {entry.request_number != null ? (
              <span title="Номер заявки в системе">заявка №{entry.request_number}</span>
            ) : null}
            {entry.object_name ? <span className="line-clamp-1">{entry.object_name}</span> : null}
          </div>

          {entry.out_doc_path ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full gap-2 text-sm"
              onClick={openSentBlank}
            >
              <FileText className="size-4 shrink-0" />
              Открыть отправленный бланк
            </Button>
          ) : null}

          {fields.map((f) => {
            const raw = systemValue(entry, f).trim();
            const display =
              !raw ? "—" : f.field_type === "date" ? formatDate(raw) : raw;
            const big = f.field_type === "textarea" || f.system_key === "out_content" || f.system_key === "in_content";
            return (
              <section key={f.id} className="space-y-1.5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </h3>
                {big && raw ? (
                  <pre className="max-h-[36vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed">
                    {display}
                  </pre>
                ) : (
                  <p className="text-sm">{display}</p>
                )}
              </section>
            );
          })}

          {entry.request_id ? (
            <Link
              to="/requests/$requestId"
              params={{ requestId: entry.request_id }}
              className="inline-flex text-sm font-medium underline-offset-2 hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Открыть карточку заявки
              {entry.request_number != null ? ` №${entry.request_number}` : ""}
            </Link>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
