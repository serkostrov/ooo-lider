import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { useRequestTypes } from "@/components/directories/request-types/data";
import { EditSheet, Field, FormActions } from "@/components/directories/common";
import { DirectoryListSkeleton, directoryListHeader } from "@/components/directories/DirectorySkeleton";
import { thLabelClass } from "@/lib/ui";
import {
  FIELD_TYPE_LABELS,
  useDeleteRegistryJournal,
  useDeleteRegistryJournalField,
  useRegistryJournalFields,
  useRegistryJournalRequestTypeIds,
  useRegistryJournals,
  useSaveRegistryJournal,
  useSaveRegistryJournalField,
  type RegistryFieldType,
  type RegistryJournal,
  type RegistryJournalField,
} from "./data";

function slugify(name: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return name
    .trim()
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "journal";
}

export function RegistryJournalsDirectory() {
  const { is_admin } = useProfile();
  const { data: journals = [], isLoading } = useRegistryJournals(false);
  const [editing, setEditing] = useState<RegistryJournal | "new" | null>(null);
  const del = useDeleteRegistryJournal();

  return (
    <div className="w-full">
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Журналы реестра</h2>
        {is_admin ? (
          <Button onClick={() => setEditing("new")} className="h-9 gap-1.5 px-3 text-sm">
            <Plus className="size-4" />
            Добавить журнал
          </Button>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Настройте вкладки реестра: поля таблицы и какие виды заявок пишут строку при отправке.
      </p>
      {isLoading ? (
        <DirectoryListSkeleton header={directoryListHeader(["№", "Название", "Код", "Виды"])} />
      ) : journals.length === 0 ? (
        <p className="rounded-md border border-border bg-card py-8 text-center text-sm text-muted-foreground">
          Журналов пока нет
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="flex gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <div className={`${thLabelClass} w-10 shrink-0`}>№</div>
            <div className={`${thLabelClass} min-w-0 flex-1`}>Название</div>
            <div className={`${thLabelClass} w-28 shrink-0`}>Код</div>
            <div className={`${thLabelClass} w-20 shrink-0 text-right`}>Статус</div>
          </div>
          <ul>
            {journals.map((j, i) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => setEditing(j)}
                  className="flex w-full items-center gap-2 border-b border-border/70 px-3 py-2.5 text-left last:border-0 hover:bg-muted/30"
                >
                  <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{j.name}</span>
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{j.code}</span>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {j.is_active ? "активен" : "выкл"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новый журнал" : "Журнал реестра"}
        className="sm:max-w-4xl"
      >
        {editing !== null ? (
          <JournalForm
            key={editing === "new" ? "new" : editing.id}
            journal={editing === "new" ? null : editing}
            nextSort={Math.max(0, ...journals.map((j) => j.sort)) + 10}
            onClose={() => setEditing(null)}
            {...(editing !== "new"
              ? {
                  onDelete: () => {
                    if (!confirm(`Удалить журнал «${editing.name}»?`)) return;
                    del.mutate(editing.id, {
                      onSuccess: () => {
                        toast.success("Удалено");
                        setEditing(null);
                      },
                      onError: showError,
                    });
                  },
                }
              : {})}
          />
        ) : null}
      </EditSheet>
    </div>
  );
}

function JournalForm({
  journal,
  nextSort,
  onClose,
  onDelete,
}: {
  journal: RegistryJournal | null;
  nextSort: number;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const save = useSaveRegistryJournal();
  const { data: types = [] } = useRequestTypes();
  const { data: linked = [] } = useRegistryJournalRequestTypeIds(journal?.id);
  const [name, setName] = useState(journal?.name ?? "");
  const [code, setCode] = useState(journal?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(!!journal);
  const [active, setActive] = useState(journal?.is_active ?? true);
  const [typeIds, setTypeIds] = useState<string[]>([]);

  useEffect(() => {
    if (journal) setTypeIds(linked);
  }, [journal, linked]);

  useEffect(() => {
    if (!codeTouched && !journal) setCode(slugify(name));
  }, [name, codeTouched, journal]);

  const { data: fields = [] } = useRegistryJournalFields(journal?.id);
  const [fieldEdit, setFieldEdit] = useState<RegistryJournalField | "new" | null>(null);
  const saveField = useSaveRegistryJournalField();
  const delField = useDeleteRegistryJournalField();

  const toggleInTable = (f: RegistryJournalField) => {
    saveField.mutate(
      {
        id: f.id,
        journal_id: journal!.id,
        label: f.label,
        field_type: f.field_type,
        system_key: f.system_key,
        options: f.options,
        is_required: f.is_required,
        show_in_table: !f.show_in_table,
        show_on_accept: f.show_on_accept,
        sort: f.sort,
      },
      {
        onSuccess: () =>
          toast.success(f.show_in_table ? "Скрыто из таблицы" : "Показано в таблице"),
        onError: showError,
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className={journal ? "grid gap-6 lg:grid-cols-2" : "space-y-4"}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Укажите название");
              return;
            }
            save.mutate(
              {
                id: journal?.id ?? null,
                code: code.trim() || slugify(name),
                name: name.trim(),
                sort: journal?.sort ?? nextSort,
                is_active: active,
                request_type_ids: typeIds,
              },
              {
                onSuccess: () => {
                  toast.success("Сохранено");
                  if (!journal) onClose();
                },
                onError: (err) => {
                  const raw =
                    err && typeof err === "object" && "message" in err
                      ? String((err as { message: unknown }).message)
                      : "";
                  if (/registry_journals_code_uidx|duplicate key/i.test(raw)) {
                    toast.error(
                      `Журнал с кодом «${code.trim() || "…"}» уже есть. Откройте его в списке или укажите другой код`,
                    );
                    return;
                  }
                  showError(err);
                },
              },
            );
          }}
        >
          <Field label="Название" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
          </Field>
          <Field label="Код (латиница, уникальный)" required>
            <Input
              value={code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
              }}
              className="h-9 font-mono text-sm"
              placeholder="например exploitation"
              disabled={!!journal}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {journal
                ? "Код нельзя менять после создания"
                : "Код letters / technadzor / geotrest уже заняты — укажите свой"}
            </p>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Показывать во вкладках реестра
          </label>

          <div className="space-y-2">
            <div className="text-sm font-medium">Виды заявок → этот журнал при отправке</div>
            <p className="text-[11px] text-muted-foreground">
              Можно отметить вид в нескольких журналах — при отправке запись появится в каждом.
            </p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
              {types.length === 0 ? (
                <p className="text-xs text-muted-foreground">Нет видов заявок</p>
              ) : (
                types.map((t) => {
                  const checked = typeIds.includes(t.id);
                  return (
                    <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setTypeIds((prev) =>
                            v ? [...prev, t.id] : prev.filter((x) => x !== t.id),
                          );
                        }}
                      />
                      <span className="min-w-0 truncate">{t.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <FormActions onCancel={onClose} pending={save.isPending} />
          {!journal ? (
            <p className="text-xs text-muted-foreground">
              После создания появятся поля (даты, исходящее/входящее) — их можно скрыть или удалить.
            </p>
          ) : null}
        </form>

        {journal ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Поля</h3>
                <p className="text-[11px] text-muted-foreground">
                  Глаз — скрыть из таблицы, корзина — убрать совсем
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                onClick={() => setFieldEdit("new")}
              >
                <Plus className="size-3.5" />
                Своё поле
              </Button>
            </div>
            <ul className="space-y-1">
              {fields.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-1"
                >
                  <button
                    type="button"
                    onClick={() => setFieldEdit(f)}
                    className="min-w-0 flex-1 rounded-sm px-1.5 py-1.5 text-left text-sm hover:bg-muted/40"
                  >
                    <span className="block truncate font-medium">{f.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {FIELD_TYPE_LABELS[f.field_type]}
                      {f.system_key ? " · системное" : ""}
                      {!f.show_in_table ? " · скрыто" : ""}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    title={f.show_in_table ? "Скрыть из таблицы" : "Показать в таблице"}
                    onClick={() => toggleInTable(f)}
                  >
                    {f.show_in_table ? (
                      <Eye className="size-3.5" />
                    ) : (
                      <EyeOff className="size-3.5 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-danger"
                    title="Удалить поле"
                    onClick={() => {
                      if (
                        !confirm(
                          f.system_key
                            ? `Убрать «${f.label}» из журнала? Потом можно только завести своё поле с похожим смыслом.`
                            : `Удалить поле «${f.label}»?`,
                        )
                      ) {
                        return;
                      }
                      delField.mutate(
                        { id: f.id, journalId: journal.id },
                        {
                          onSuccess: () => toast.success("Поле удалено"),
                          onError: showError,
                        },
                      );
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full text-sm text-danger hover:text-danger"
                onClick={onDelete}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Удалить журнал
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {journal && fieldEdit !== null ? (
        <FieldForm
          journalId={journal.id}
          field={fieldEdit === "new" ? null : fieldEdit}
          nextSort={Math.max(0, ...fields.map((f) => f.sort)) + 10}
          onClose={() => setFieldEdit(null)}
        />
      ) : null}
    </div>
  );
}

function FieldForm({
  journalId,
  field,
  nextSort,
  onClose,
}: {
  journalId: string;
  field: RegistryJournalField | null;
  nextSort: number;
  onClose: () => void;
}) {
  const save = useSaveRegistryJournalField();
  const del = useDeleteRegistryJournalField();
  const [label, setLabel] = useState(field?.label ?? "");
  const [fieldType, setFieldType] = useState<RegistryFieldType>(field?.field_type ?? "text");
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join("\n"));
  const [required, setRequired] = useState(field?.is_required ?? false);
  const [inTable, setInTable] = useState(field?.show_in_table ?? true);
  const [onAccept, setOnAccept] = useState(field?.show_on_accept ?? false);
  const isSystem = !!field?.system_key;

  const options = useMemo(
    () =>
      optionsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [optionsText],
  );

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 text-sm font-medium">{field ? "Поле" : "Новое поле"}</div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) {
            toast.error("Укажите название поля");
            return;
          }
          save.mutate(
            {
              id: field?.id ?? null,
              journal_id: journalId,
              label: label.trim(),
              field_type: fieldType,
              system_key: field?.system_key ?? null,
              options: fieldType === "select" ? options : [],
              is_required: required,
              show_in_table: inTable,
              show_on_accept: onAccept,
              sort: field?.sort ?? nextSort,
            },
            {
              onSuccess: () => {
                toast.success("Поле сохранено");
                onClose();
              },
              onError: showError,
            },
          );
        }}
      >
        <Field label="Название" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 text-sm" />
        </Field>
        <Field label="Тип">
          <Select
            value={fieldType}
            onValueChange={(v) => setFieldType(v as RegistryFieldType)}
            disabled={isSystem}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FIELD_TYPE_LABELS) as RegistryFieldType[]).map((t) => (
                <SelectItem key={t} value={t} className="text-sm">
                  {FIELD_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {fieldType === "select" ? (
          <Field label="Варианты (по одному в строке)">
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={required} onCheckedChange={setRequired} />
          Обязательное (при ответе / сохранении)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={inTable} onCheckedChange={setInTable} />
          Показывать в таблице
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onAccept} onCheckedChange={setOnAccept} />
          Спрашивать при «Принята заказчиком»
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending} className="h-9 flex-1 text-sm">
            {save.isPending ? "…" : "Сохранить поле"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="h-9 flex-1 text-sm">
            Отмена
          </Button>
        </div>
        {field ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full text-xs text-danger"
            onClick={() => {
              if (
                !confirm(
                  isSystem
                    ? `Убрать системное поле «${field.label}» из журнала?`
                    : `Удалить поле «${field.label}»?`,
                )
              ) {
                return;
              }
              del.mutate(
                { id: field.id, journalId },
                {
                  onSuccess: () => {
                    toast.success("Поле удалено");
                    onClose();
                  },
                  onError: showError,
                },
              );
            }}
          >
            Удалить поле
          </Button>
        ) : null}
      </form>
    </div>
  );
}
