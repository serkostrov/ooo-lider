import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, emptyToNull } from "../common";
import { STAGES_KEY, toIntOrNull, useRoles, useWorkTypes, type StageTemplate } from "./data";
import { useProfile } from "@/lib/profile";
import { listTemplateFiles, removeTemplateFile, uploadTemplateFile, type TemplateDocKind } from "@/lib/files";
import { TemplateDocField, docTitleFromFile, type StagedFile } from "./TemplateDocField";

/** Supabase по умолчанию принимает файлы до 50 МБ. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const NONE = "__none";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/50">
      <div className="border-b border-border/80 px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {hint ? <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="space-y-6 p-5">{children}</div>
    </section>
  );
}

export function StageMainForm({
  stage,
  allStages,
  readOnly,
  onCreated,
}: {
  stage: StageTemplate | null;
  allStages: StageTemplate[];
  readOnly: boolean;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const { data: workTypes = [] } = useWorkTypes();

  const nextNumber = allStages.reduce((m, s) => Math.max(m, s.number), 0) + 1;
  const [number, setNumber] = useState(String(stage?.number ?? nextNumber));
  const [name, setName] = useState(stage?.name ?? "");
  const [workType, setWorkType] = useState(stage?.work_type_id ?? "");
  const [description, setDescription] = useState(stage?.description ?? "");
  const [duration, setDuration] = useState(stage?.duration_days?.toString() ?? "");
  const [executor, setExecutor] = useState(stage?.executor_role ?? NONE);
  const [confirmer, setConfirmer] = useState(stage?.confirmer_role ?? NONE);
  const [outgoing, setOutgoing] = useState(stage?.outgoing_doc ?? "");
  const [expected, setExpected] = useState(stage?.expected_doc ?? "");
  const [responseDays, setResponseDays] = useState(stage?.response_days?.toString() ?? "");
  const [remindDays, setRemindDays] = useState(stage?.remind_days?.toString() ?? "");
  const [critical, setCritical] = useState(stage?.is_critical ?? false);
  const [active, setActive] = useState(stage?.is_active ?? true);

  // Файлы «От нас» / «Ждём» (правка 2.3): копятся до «Сохранить»
  const me = useProfile();
  const filesKey = ["template-files", stage?.id ?? "new"];
  const { data: savedFiles = [] } = useQuery({
    queryKey: filesKey,
    enabled: !!stage,
    queryFn: () => listTemplateFiles(stage!.id),
  });
  const [added, setAdded] = useState<Record<TemplateDocKind, StagedFile[]>>({ outgoing: [], expected: [] });
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const filesDirty = added.outgoing.length + added.expected.length + removed.size > 0;
  const resetFiles = () => {
    setAdded({ outgoing: [], expected: [] });
    setRemoved(new Set());
  };
  const addFiles = (kind: TemplateDocKind, files: File[]) => {
    const big = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (big.length) toast.error(`Слишком большой файл (больше 50 МБ): ${big.map((f) => f.name).join(", ")}`);
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES).map((file) => ({ key: crypto.randomUUID(), file }));
    setAdded((a) => ({ ...a, [kind]: [...a[kind], ...ok] }));
  };
  const toggleRemoved = (id: string) =>
    setRemoved((r) => {
      const n = new Set(r);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /** Название документа; если не заполнено — по первому оставшемуся файлу. */
  const docName = (kind: TemplateDocKind, typed: string) => {
    if (typed.trim()) return typed.trim();
    const first =
      savedFiles.find((f) => f.kind === kind && !removed.has(f.id))?.file_name ?? added[kind][0]?.file.name;
    return first ? docTitleFromFile(first) : null;
  };

  const m = useMutation({
    mutationFn: async () => {
      const num = toIntOrNull(number);
      const dur = toIntOrNull(duration);
      const resp = toIntOrNull(responseDays);
      const rem = toIntOrNull(remindDays);
      if (num === null || num === "bad" || num < 1) throw new Error("Номер этапа — целое число больше 0");
      if (dur === "bad" || resp === "bad" || rem === "bad")
        throw new Error("Сроки — целые числа от 0 или пусто");
      if (!name.trim()) throw new Error("Укажите название этапа");
      if (!workType) throw new Error("Выберите группу");
      if (allStages.some((s) => s.number === num && s.id !== stage?.id))
        throw new Error(`Этап с номером ${num} уже есть`);

      const payload = {
        number: num,
        sort: num,
        name: name.trim(),
        work_type_id: workType,
        description: emptyToNull(description),
        duration_days: dur,
        executor_role: executor === NONE ? null : executor,
        confirmer_role: confirmer === NONE ? null : confirmer,
        outgoing_doc: docName("outgoing", outgoing),
        expected_doc: docName("expected", expected),
        response_days: resp,
        remind_days: rem,
        is_critical: critical,
        is_active: active,
      };
      let id = stage?.id;
      if (stage) {
        const { error } = await supabase.from("stage_templates").update(payload).eq("id", stage.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("stage_templates").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      // Файлы — по одному; каждый успешный сразу убираем из очереди, чтобы повтор не задвоил загрузку
      for (const f of savedFiles.filter((x) => removed.has(x.id))) {
        await removeTemplateFile(f);
        setRemoved((r) => {
          const n = new Set(r);
          n.delete(f.id);
          return n;
        });
      }
      for (const kind of ["outgoing", "expected"] as const) {
        for (const a of added[kind]) {
          await uploadTemplateFile(id!, kind, a.file, me.id);
          setAdded((x) => ({ ...x, [kind]: x[kind].filter((y) => y.key !== a.key) }));
        }
      }
      return id!;
    },
    onSettled: (id) => {
      if (id || stage) qc.invalidateQueries({ queryKey: ["template-files", id ?? stage!.id] });
    },
    onSuccess: async (id) => {
      toast.success("Сохранено");
      resetFiles();
      setOutgoing((v) => v.trim() || docName("outgoing", v) || "");
      setExpected((v) => v.trim() || docName("expected", v) || "");
      qc.invalidateQueries({ queryKey: ["dir-stage-templates-short"] });
      await qc.invalidateQueries({ queryKey: STAGES_KEY });
      if (!stage) onCreated(id);
    },
    onError: showError,
  });

  const roleSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={onChange} disabled={readOnly}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-sm">
          Не указано
        </SelectItem>
        {roles.map((r) => (
          <SelectItem key={r.code} value={r.code} className="text-sm">
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const num = (value: string, onChange: (v: string) => void) => (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="numeric"
      disabled={readOnly}
      className="h-9 text-sm"
    />
  );

  return (
    <form
      className="w-full space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Section title="Основное" hint="Номер, название и группа этапа в регламенте.">
        <div className="grid gap-6 sm:grid-cols-[7.5rem_minmax(0,1.4fr)_minmax(0,1fr)]">
          <Field label="Номер" required>
            {num(number, setNumber)}
          </Field>
          <Field label="Название" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              className="h-9 text-sm"
            />
          </Field>
          <Field label="Группа" required>
            <Select value={workType} onValueChange={setWorkType} disabled={readOnly}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Выберите группу" />
              </SelectTrigger>
              <SelectContent>
                {workTypes.map((w) => (
                  <SelectItem key={w.id} value={w.id} className="text-sm">
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!readOnly && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Список — в Справочниках, вкладка «Группы».
              </p>
            )}
          </Field>
        </div>
        <Field label="Описание">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
            rows={3}
            className="text-sm"
            placeholder="Кратко, зачем этап и что важно помнить"
          />
        </Field>
      </Section>

      <Section title="Ответственные" hint="Кто выполняет этап и кто подтверждает результат.">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Роль исполнителя">{roleSelect(executor, setExecutor)}</Field>
          <Field label="Адресат — кто подтверждает">{roleSelect(confirmer, setConfirmer)}</Field>
        </div>
      </Section>

      <Section
        title="Документы"
        hint="Образцы исходящих и ответных документов. Изменения файлов применятся после «Сохранить»."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {(
            [
              [
                "outgoing",
                "«От нас» — исходящий документ",
                "Что отправляем: бланк, заявление, образец.",
                outgoing,
                setOutgoing,
              ],
              [
                "expected",
                "«Ждём» — ответный документ",
                "Что должны прислать в ответ.",
                expected,
                setExpected,
              ],
            ] as const
          ).map(([kind, label, hint, value, setValue]) => (
            <TemplateDocField
              key={kind}
              label={label}
              hint={`${hint} Без названия — возьмётся из первого файла.`}
              name={value}
              onName={setValue}
              existing={savedFiles.filter((f) => f.kind === kind)}
              added={added[kind]}
              removed={removed}
              onAdd={(files) => addFiles(kind, files)}
              onDropAdded={(key) => setAdded((a) => ({ ...a, [kind]: a[kind].filter((x) => x.key !== key) }))}
              onToggleRemoved={toggleRemoved}
              readOnly={readOnly}
            />
          ))}
        </div>
      </Section>

      <Section title="Сроки и флаги" hint="Длительность этапа, контроль ответа и отображение в списках.">
        <div className="grid gap-6 sm:grid-cols-3">
          <Field label="Срок этапа, дней">{num(duration, setDuration)}</Field>
          <Field label="Дней на ответ">{num(responseDays, setResponseDays)}</Field>
          <Field label="Напомнить за, дней">{num(remindDays, setRemindDays)}</Field>
        </div>
        <div className="grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm">
            <Switch checked={critical} onCheckedChange={setCritical} disabled={readOnly} className="mt-0.5" />
            <span>
              <span className="font-medium">Критичный</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Выделяется в списке этапов
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm">
            <Switch checked={active} onCheckedChange={setActive} disabled={readOnly} className="mt-0.5" />
            <span>
              <span className="font-medium">Активен</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Неактивный не предлагается на новых объектах
              </span>
            </span>
          </label>
        </div>
        {!active && (
          <p className="text-sm text-muted-foreground">
            На уже созданных объектах этап остаётся, даже если снять «Активен».
          </p>
        )}
      </Section>

      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-border/60 bg-background/95 px-1 py-4 backdrop-blur-sm">
          <Button type="submit" disabled={m.isPending} className="h-10 px-6 text-sm">
            {m.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {filesDirty && !m.isPending && (
            <>
              <Button type="button" variant="outline" onClick={resetFiles} className="h-10 text-sm">
                Отменить изменения файлов
              </Button>
              <span className="text-sm text-muted-foreground">Файлы сохранятся после «Сохранить»</span>
            </>
          )}
        </div>
      )}
    </form>
  );
}
