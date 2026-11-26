import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { supabase } from "@/integrations/supabase/client";
import { RegistryFieldInput } from "./RegistryFieldInputs";
import {
  registryAcceptWithResponse,
  registryJournalIdForRequest,
  useRegistryJournalFields,
  type RegistryJournalField,
} from "./data";

export function AcceptResponseDialog({
  open,
  onOpenChange,
  requestId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requestId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [journalId, setJournalId] = useState<string | null>(null);
  const { data: fields = [] } = useRegistryJournalFields(journalId);
  const acceptFields = useMemo(
    () => fields.filter((f) => f.show_on_accept),
    [fields],
  );
  const acceptFieldsKey = useMemo(
    () => acceptFields.map((f) => f.id).join(","),
    [acceptFields],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPending(false);
    setValues({});
    setJournalId(null);
    void registryJournalIdForRequest(requestId)
      .then((id) => setJournalId(id))
      .catch(() => setJournalId(null));
  }, [open, requestId]);

  // Только при открытии / смене набора полей — иначе каждый ввод сбрасывал форму
  // (acceptFields был новым массивом на каждый рендер).
  useEffect(() => {
    if (!open || !acceptFieldsKey) return;
    const next: Record<string, string> = {};
    for (const f of acceptFields) {
      next[f.id] = f.field_type === "date" || f.system_key === "in_date" ? mskToday() : "";
    }
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- намеренно по ключу полей
  }, [open, acceptFieldsKey]);

  const bySystem = (key: string) => {
    const f = acceptFields.find((x) => x.system_key === key);
    return f ? values[f.id] ?? "" : "";
  };

  const finishOk = () => {
    void qc.invalidateQueries({ queryKey: ["registry-entries"] });
    onOpenChange(false);
    onDone();
  };

  const acceptWithoutResponse = async () => {
    setPending(true);
    try {
      const { error } = await supabase.rpc("request_set_status", {
        p_request_id: requestId,
        p_status: "accepted",
      });
      if (error) throw error;
      toast.success("Принята заказчиком — ответ можно дописать в Реестре");
      finishOk();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  };

  const acceptWithResponse = async () => {
    const letterNo = bySystem("in_letter_no");
    const content = bySystem("in_content");
    const date = bySystem("in_date") || mskToday();

    const hasAny = acceptFields.some((f) => (values[f.id] ?? "").trim());
    if (!hasAny) {
      await acceptWithoutResponse();
      return;
    }

    for (const f of acceptFields) {
      if (f.is_required && !(values[f.id] ?? "").trim()) {
        toast.error(`Заполните «${f.label}» или нажмите «Без ответа»`);
        return;
      }
    }

    const extra: Record<string, unknown> = {};
    for (const f of acceptFields) {
      if (!f.system_key) extra[f.id] = values[f.id] ?? "";
    }

    setPending(true);
    try {
      await registryAcceptWithResponse({
        requestId,
        letterNo: letterNo.trim(),
        content: content.trim(),
        date: date || null,
        extra,
      });
      toast.success("Принята заказчиком");
      finishOk();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  };

  const setField = (f: RegistryJournalField, v: string) => {
    setValues((prev) => ({ ...prev, [f.id]: v }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Ответ заказчика</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void acceptWithResponse();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Можно заполнить сейчас или пропустить — данные допишутся потом в разделе «Реестр».
          </p>
          {acceptFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Для журнала не настроены поля ответа — можно принять без заполнения.
            </p>
          ) : (
            acceptFields.map((f) => (
              <label key={f.id} className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  {f.label}
                  {f.is_required ? " *" : ""}
                </span>
                <RegistryFieldInput
                  field={f}
                  value={values[f.id] ?? ""}
                  onChange={(v) => setField(f, v)}
                />
              </label>
            ))
          )}
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={pending}
                className="h-9 flex-1 bg-success text-sm text-success-foreground hover:bg-success/90"
              >
                {pending ? "Сохранение…" : "Принять"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => onOpenChange(false)}
                className="h-9 flex-1 text-sm"
              >
                Отмена
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => void acceptWithoutResponse()}
              className="h-9 w-full text-sm text-muted-foreground"
            >
              Принять без ответа
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
