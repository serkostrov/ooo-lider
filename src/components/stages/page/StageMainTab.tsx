import { forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, showError } from "@/lib/format";
import { addDays } from "@/lib/dates";
import { formatSize, listTemplateFiles, openTemplateFile, type TemplateFile } from "@/lib/files";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/DateField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/directories/common";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import { toIntOrNull } from "@/components/directories/stages/data";
import { useActiveProfiles } from "@/components/objects/data";
import { StatusBadge, useObjectStages, type ObjectStage } from "../data";

const NONE = "__none";

export type StageMainHandle = {
  save: () => Promise<void>;
  reset: () => void;
};

function Section({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Block({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-border/80 bg-card/40 px-3.5 py-3 sm:px-4 sm:py-3.5">{children}</div>
  );
}

function draftFrom(stage: ObjectStage) {
  return {
    executor_id: stage.executor_id ?? "",
    coexecutor_id: stage.coexecutor_id ?? "",
    confirmer_id: stage.confirmer_id ?? "",
    start_date: stage.start_date ?? "",
    due_date: stage.due_date ?? "",
    doc_sent_at: stage.doc_sent_at ?? "",
    response_days: stage.response_days?.toString() ?? "",
    response_received_at: stage.response_received_at ?? "",
    remind_days: stage.remind_days?.toString() ?? "",
    note: stage.note ?? "",
  };
}

export const StageMainTab = forwardRef<
  StageMainHandle,
  { stage: ObjectStage; onSaved: () => void; editing: boolean; canAssign: boolean; canWork: boolean }
>(function StageMainTab({ stage, onSaved, editing, canAssign, canWork }, ref) {
  const { data: profiles = [] } = useActiveProfiles();
  const [v, setV] = useState(() => draftFrom(stage));
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));

  const respDays = toIntOrNull(v.response_days);
  const responseDue = v.doc_sent_at && typeof respDays === "number" ? addDays(v.doc_sent_at, respDays) : "";

  const showDoc =
    !!stage.outgoing_doc ||
    !!stage.expected_doc ||
    !!v.doc_sent_at ||
    !!v.response_days ||
    !!v.response_received_at ||
    !!stage.template_id;

  const save = useMutation({
    mutationFn: async () => {
      if (!v.executor_id) throw new Error("Укажите исполнителя — кто делает этап");
      const rd = toIntOrNull(v.response_days);
      const rm = toIntOrNull(v.remind_days);
      if (rd === "bad" || rm === "bad") throw new Error("Дни — целое число от 0 или пусто");
      if (v.start_date && v.due_date && v.due_date < v.start_date) throw new Error("Срок окончания раньше даты начала");
      const d = (x: string) => x || null;
      const { error } = await supabase
        .from("object_stages")
        .update({
          executor_id: d(v.executor_id),
          coexecutor_id: d(v.coexecutor_id),
          confirmer_id: d(v.confirmer_id),
          start_date: d(v.start_date),
          due_date: d(v.due_date),
          doc_sent_at: d(v.doc_sent_at),
          response_days: rd,
          response_received_at: d(v.response_received_at),
          remind_days: rm,
          note: v.note.trim() || null,
        })
        .eq("id", stage.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      onSaved();
    },
    onError: showError,
  });

  useImperativeHandle(
    ref,
    () => ({
      save: () => save.mutateAsync().then(() => undefined),
      reset: () => setV(draftFrom(stage)),
    }),
    [save, stage],
  );

  const assignOn = editing && canAssign;
  const workOn = editing && canWork;

  const person = (k: "executor_id" | "coexecutor_id" | "confirmer_id", placeholder: string) => (
    <Select value={v[k] || NONE} onValueChange={(x) => set(k, x === NONE ? "" : x)}>
      <SelectTrigger className="h-9 w-full text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-sm">
          {placeholder}
        </SelectItem>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-sm">
            {p.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const date = (k: keyof typeof v) => (
    <DateField value={v[k]} onChange={(ymd) => set(k, ymd)} />
  );

  return (
    <div className="w-full space-y-3">
      {stage.description && (
        <p className="whitespace-pre-line text-sm leading-snug text-muted-foreground">{stage.description}</p>
      )}
      {stage.return_reason && stage.status_code !== "closed" && (
        <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
          <span className="font-semibold text-warning">Возвращён на доработку:</span> {stage.return_reason}
        </div>
      )}

      <Block>
        <div className="space-y-3">
          <Section
            title="Кто делает"
            {...(assignOn
              ? { hint: "исполнитель обязателен" }
              : editing && !canAssign
                ? { hint: "назначает администратор" }
                : {})}
          >
            <div className="grid gap-2.5 sm:grid-cols-3">
              {assignOn ? (
                <Field label="Исполнитель" required>
                  {person("executor_id", "не назначен")}
                </Field>
              ) : (
                <Readout label="Исполнитель" value={stage.executor_name} />
              )}
              {assignOn ? (
                <Field label="Соисполнитель">{person("coexecutor_id", "Нет")}</Field>
              ) : (
                <Readout label="Соисполнитель" value={stage.coexecutor_name} />
              )}
              <div className="min-w-0">
                {assignOn ? (
                  <Field label="Кто принимает">{person("confirmer_id", "По роли")}</Field>
                ) : (
                  <Readout label="Кто принимает" value={stage.confirmer_name ?? stage.confirmer_role_name} />
                )}
                {stage.confirmer_role_name && (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    По регламенту: {stage.confirmer_role_name}
                  </p>
                )}
              </div>
            </div>
          </Section>

          <div className="border-t border-border/70 pt-3">
            <Section title="Сроки">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
                {workOn ? (
                  <>
                    <Field label="Дата начала">{date("start_date")}</Field>
                    <Field label="Срок окончания">{date("due_date")}</Field>
                    <Field label="Напомнить, дн.">
                      <Input
                        value={v.remind_days}
                        onChange={(e) => set("remind_days", e.target.value)}
                        inputMode="numeric"
                        className="h-9 w-[5.5rem] text-sm tabular-nums"
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Readout label="Дата начала" value={formatDate(stage.start_date)} />
                    <Readout label="Срок окончания" value={formatDate(stage.due_date)} />
                    <Readout label="Напомнить, дн." value={stage.remind_days?.toString()} />
                  </>
                )}
              </div>
            </Section>
          </div>
        </div>
      </Block>

      {showDoc && (
        <Block>
          <Section
            title="Исходящий документ"
            {...(stage.outgoing_doc || stage.expected_doc
              ? {
                  hint: [
                    stage.outgoing_doc ? `от нас «${stage.outgoing_doc}»` : null,
                    stage.expected_doc ? `ждём «${stage.expected_doc}»` : null,
                  ]
                    .filter(Boolean)
                    .join(" → "),
                }
              : {})}
          >
            <div className="space-y-2.5">
              <TemplateSamples templateId={stage.template_id} />
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
                {workOn ? (
                  <>
                    <Field label="Дата отправки">{date("doc_sent_at")}</Field>
                    <Field label="Дней на ответ">
                      <Input
                        value={v.response_days}
                        onChange={(e) => set("response_days", e.target.value)}
                        inputMode="numeric"
                        className="h-9 w-[5.5rem] text-sm tabular-nums"
                      />
                    </Field>
                    <Field label="Ждём ответ до">
                      <div className="flex h-9 w-[11.5rem] items-center rounded-md border border-border bg-muted/40 px-2.5 text-sm tabular-nums text-muted-foreground">
                        {formatDate(responseDue) || "—"}
                      </div>
                    </Field>
                    <Field label="Ответ получен">{date("response_received_at")}</Field>
                  </>
                ) : (
                  <>
                    <Readout label="Дата отправки" value={formatDate(stage.doc_sent_at)} />
                    <Readout label="Дней на ответ" value={stage.response_days?.toString()} />
                    <Readout label="Ждём ответ до" value={formatDate(stage.response_due)} />
                    <Readout label="Ответ получен" value={formatDate(stage.response_received_at)} />
                  </>
                )}
              </div>
            </div>
          </Section>
        </Block>
      )}

      <Block>
        <Section title="Заметка" {...(workOn ? { hint: "что мешает или когда обещали" } : {})}>
          {workOn ? (
            <Textarea
              value={v.note}
              onChange={(e) => set("note", e.target.value)}
              rows={3}
              placeholder="Например: ждут подпись заказчика до пятницы"
              className="min-h-[4.5rem] w-full resize-y text-sm"
            />
          ) : (
            <p className="whitespace-pre-line text-sm">
              {stage.note?.trim() || <span className="text-muted-foreground">—</span>}
            </p>
          )}
        </Section>
      </Block>

      <Predecessors stage={stage} />
      <LinkedRequests stage={stage} />
    </div>
  );
});

function Readout({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  return (
    <div className={fieldStackClass}>
      <div className={fieldLabelClass}>{label}</div>
      <div className="flex min-h-9 items-center text-sm">{text || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function Predecessors({ stage }: { stage: ObjectStage }) {
  const { data: all = [] } = useObjectStages(stage.object_id);
  const { data: ids = [] } = useQuery({
    queryKey: ["stage-predecessors", stage.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("object_stage_predecessors")
        .select("predecessor_id")
        .eq("stage_id", stage.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.predecessor_id as string);
    },
  });
  const preds = all.filter((s) => ids.includes(s.id));
  if (preds.length === 0) return null;
  return (
    <Block>
      <Section title="Предшествующие этапы">
        <ul className="divide-y divide-border">
          {preds.map((p) => (
            <li key={p.id}>
              <Link
                to="/objects/$id/stages/$stageId"
                params={{ id: stage.object_id, stageId: p.id }}
                className="flex items-center gap-3 py-2 text-sm transition-colors hover:text-primary"
              >
                <span className="w-8 shrink-0 tabular-nums text-muted-foreground">{p.number}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <StatusBadge name={p.status_name} color={p.status_color} />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </Block>
  );
}

function LinkedRequests({ stage }: { stage: ObjectStage }) {
  const { data = [] } = useQuery({
    queryKey: ["stage-requests", stage.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_requests")
        .select("id, number, type_name, call_date, status")
        .eq("stage_id", stage.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (data.length === 0) return null;
  return (
    <Block>
      <Section title="Связанные заявки">
        <ul className="divide-y divide-border">
          {data.map((r) => (
            <li key={r.id}>
              <Link
                to="/requests/$requestId"
                params={{ requestId: r.id! }}
                search={{ from: "object" }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm transition-colors hover:text-primary"
              >
                <span className="font-medium tabular-nums">№{r.number}</span>
                <span className="min-w-0 flex-1 truncate">{r.type_name}</span>
                <span className="text-muted-foreground">вызов на {formatDate(r.call_date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </Block>
  );
}

/** Образцы «От нас» / «Ждём» из справочника этапов (правка 2.3). Нет файлов — блока нет. */
function TemplateSamples({ templateId }: { templateId: string | null }) {
  const { data: files = [] } = useQuery({
    queryKey: ["template-files", templateId ?? "none"],
    enabled: !!templateId,
    queryFn: () => listTemplateFiles(templateId!),
  });
  if (files.length === 0) return null;
  const group = (kind: TemplateFile["kind"], label: string) => {
    const list = files.filter((f) => f.kind === kind);
    if (list.length === 0) return null;
    return (
      <div className="min-w-0 flex-1">
        <div className="mb-3 text-sm font-medium leading-5 text-muted-foreground">{label}</div>
        <ul className="space-y-1">
          {list.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => openTemplateFile(f.storage_path).catch(showError)}
                className="min-w-0 truncate text-left text-primary hover:underline"
                title={f.file_name}
              >
                {f.file_name}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size_bytes)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2">
      {group("outgoing", "Образцы «От нас»")}
      {group("expected", "Образцы «Ждём»")}
    </div>
  );
}
