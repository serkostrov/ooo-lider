import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { BlankConstructorPreview } from "./BlankConstructorPreview";
import { PlaceholderTextarea } from "./PlaceholderTextarea";
import {
  BLANK_FORMATS,
  type BlankConfig,
  type BlankFormat,
  type ExcelColumnConfig,
  type FieldSourceKind,
  type TableRowConfig,
  SAMPLE_FIELD_OPTIONS,
  SAMPLE_OBJECT_OPTIONS,
  defaultConfig,
  defaultEngineForFormat,
  formatLabel,
} from "./types";
import { presetConfigForEngine } from "./enginePresets";

function newId() {
  return crypto.randomUUID();
}

function cloneConfig(c: BlankConfig): BlankConfig {
  return structuredClone(c);
}

function sameConfig(a: BlankConfig, b: BlankConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SourceEditors({
  kind,
  value,
  onKind,
  onValue,
}: {
  kind: FieldSourceKind;
  value: string;
  onKind: (k: FieldSourceKind) => void;
  onValue: (v: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row">
      <Select value={kind} onValueChange={(v) => onKind(v as FieldSourceKind)}>
        <SelectTrigger className="h-9 w-full sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="field">Поле заявки</SelectItem>
          <SelectItem value="object">Объект</SelectItem>
          <SelectItem value="constant">Константа</SelectItem>
        </SelectContent>
      </Select>
      {kind === "constant" ? (
        <Input
          className="h-9 flex-1"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder="Текст"
        />
      ) : kind === "object" ? (
        <Select value={value} onValueChange={onValue}>
          <SelectTrigger className="h-9 flex-1">
            <SelectValue placeholder="Поле объекта" />
          </SelectTrigger>
          <SelectContent>
            {SAMPLE_OBJECT_OPTIONS.map((o) => (
              <SelectItem key={o.v} value={o.v}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select value={value} onValueChange={onValue}>
          <SelectTrigger className="h-9 flex-1">
            <SelectValue placeholder="Поле заявки" />
          </SelectTrigger>
          <SelectContent>
            {SAMPLE_FIELD_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function FormatStep({
  format,
  onPick,
}: {
  format: BlankFormat | null;
  onPick: (f: BlankFormat) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm">Тип бланка</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          От типа зависят настройки и превью справа.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {BLANK_FORMATS.map((f) => {
          const active = format === f.v;
          return (
            <button
              key={f.v}
              type="button"
              onClick={() => onPick(f.v)}
              className={cn(
                "rounded-lg border px-3 py-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <div className="text-sm font-semibold">{f.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{f.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CommonToggles({
  config,
  patch,
  showLetterhead,
  showDirector,
  showRecipient,
  showOutgoing,
}: {
  config: BlankConfig;
  patch: (p: Partial<BlankConfig>) => void;
  showLetterhead: boolean;
  showDirector: boolean;
  showRecipient: boolean;
  showOutgoing: boolean;
}) {
  return (
    <div className="space-y-4">
      {showLetterhead && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <div>
            <Label className="text-sm">Подложка / шапка Лидер</Label>
            <p className="text-xs text-muted-foreground">Логотип и реквизиты сверху</p>
          </div>
          <Switch
            checked={config.letterhead}
            onCheckedChange={(v) => patch({ letterhead: v })}
          />
        </div>
      )}
      {showOutgoing && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <div>
            <Label className="text-sm">Исх. № и дата на бланке</Label>
            <p className="text-xs text-muted-foreground">
              Слева: «Исх. № … от …». Дата — сегодня, номер проставляется при подготовке/отправке бланка.
            </p>
          </div>
          <Switch
            checked={config.showOutgoing}
            onCheckedChange={(v) => patch({ showOutgoing: v })}
          />
        </div>
      )}
      {showDirector && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <div>
            <Label className="text-sm">Директор / печать / подпись</Label>
            <p className="text-xs text-muted-foreground">Блок внизу бланка</p>
          </div>
          <Switch
            checked={config.showDirectorBlock}
            onCheckedChange={(v) => patch({ showDirectorBlock: v })}
          />
        </div>
      )}
      {showRecipient && (
        <div className="space-y-2">
          <Label className="text-sm">Получатель (строки «Кому»)</Label>
          {config.recipientLines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <Input
                className="h-9"
                value={line}
                onChange={(e) => {
                  const next = [...config.recipientLines];
                  next[i] = e.target.value;
                  patch({ recipientLines: next });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  patch({
                    recipientLines: config.recipientLines.filter((_, j) => j !== i),
                  });
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => patch({ recipientLines: [...config.recipientLines, ""] })}
          >
            <Plus className="size-3.5" /> Строка
          </Button>
        </div>
      )}
    </div>
  );
}

function TableRowsEditor({
  rows,
  onChange,
}: {
  rows: TableRowConfig[];
  onChange: (rows: TableRowConfig[]) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-sm">Строки таблицы</Label>
      {rows.map((row, i) => (
        <div
          key={row.id}
          className="space-y-2 rounded-md border border-border bg-muted/20 p-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <Input
              className="h-9"
              value={row.title}
              onChange={(e) =>
                onChange(
                  rows.map((r) => (r.id === row.id ? { ...r, title: e.target.value } : r)),
                )
              }
              placeholder="Заголовок строки"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(rows.filter((_, idx) => idx !== i));
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <SourceEditors
            kind={row.sourceKind}
            value={row.sourceValue}
            onKind={(sourceKind) =>
              onChange(
                rows.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        sourceKind,
                        sourceValue:
                          sourceKind === "object"
                            ? SAMPLE_OBJECT_OPTIONS[0].v
                            : sourceKind === "field"
                              ? SAMPLE_FIELD_OPTIONS[0]
                              : "",
                      }
                    : r,
                ),
              )
            }
            onValue={(sourceValue) =>
              onChange(rows.map((r) => (r.id === row.id ? { ...r, sourceValue } : r)))
            }
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() =>
          onChange([
            ...rows,
            {
              id: newId(),
              title: "Новая строка",
              sourceKind: "field",
              sourceValue: SAMPLE_FIELD_OPTIONS[0],
            },
          ])
        }
      >
        <Plus className="size-3.5" /> Строка
      </Button>
    </div>
  );
}

function ExcelColumnsEditor({
  columns,
  onChange,
}: {
  columns: ExcelColumnConfig[];
  onChange: (cols: ExcelColumnConfig[]) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-sm">Колонки Excel</Label>
      {columns.map((col, i) => (
        <div
          key={col.id}
          className="space-y-2 rounded-md border border-border bg-muted/20 p-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <Input
              className="h-9"
              value={col.title}
              onChange={(e) =>
                onChange(
                  columns.map((c) =>
                    c.id === col.id ? { ...c, title: e.target.value } : c,
                  ),
                )
              }
              placeholder="Заголовок колонки"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(columns.filter((_, idx) => idx !== i));
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <SourceEditors
            kind={col.sourceKind}
            value={col.sourceValue}
            onKind={(sourceKind) =>
              onChange(
                columns.map((c) =>
                  c.id === col.id
                    ? {
                        ...c,
                        sourceKind,
                        sourceValue:
                          sourceKind === "object"
                            ? SAMPLE_OBJECT_OPTIONS[0].v
                            : sourceKind === "field"
                              ? SAMPLE_FIELD_OPTIONS[0]
                              : "",
                      }
                    : c,
                ),
              )
            }
            onValue={(sourceValue) =>
              onChange(
                columns.map((c) => (c.id === col.id ? { ...c, sourceValue } : c)),
              )
            }
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() =>
          onChange([
            ...columns,
            {
              id: newId(),
              title: "Колонка",
              sourceKind: "field",
              sourceValue: SAMPLE_FIELD_OPTIONS[0],
            },
          ])
        }
      >
        <Plus className="size-3.5" /> Колонка
      </Button>
    </div>
  );
}

function ConfigStep({
  config,
  patch,
}: {
  config: BlankConfig;
  patch: (p: Partial<BlankConfig>) => void;
}) {
  if (!config.format) {
    return (
      <p className="text-sm text-muted-foreground">Сначала выберите формат на шаге 1.</p>
    );
  }

  const isWord = config.format === "word_table" || config.format === "word_fax";

  return (
    <div className="space-y-6">
      <CommonToggles
        config={config}
        patch={patch}
        showLetterhead={isWord}
        showDirector={isWord}
        showRecipient={isWord}
        showOutgoing={isWord}
      />

      {config.format === "word_table" && (
        <TableRowsEditor
          rows={config.tableRows}
          onChange={(tableRows) => patch({ tableRows })}
        />
      )}

      {config.format === "word_fax" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Заголовок</Label>
            <Input
              className="h-9"
              value={config.faxTitle}
              onChange={(e) => patch({ faxTitle: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Текст факса</Label>
            <p className="text-xs text-muted-foreground">
              Наберите {"{{"} — появится список полей для вставки
            </p>
            <PlaceholderTextarea
              rows={8}
              value={config.faxBody}
              onChange={(faxBody) => patch({ faxBody })}
            />
          </div>
        </div>
      )}

      {config.format === "excel" && (
        <ExcelColumnsEditor
          columns={config.excelColumns}
          onChange={(excelColumns) => patch({ excelColumns })}
        />
      )}

      {config.format === "message" && (
        <div className="space-y-1.5">
          <Label className="text-sm">Шаблон сообщения</Label>
          <p className="text-xs text-muted-foreground">
            Наберите {"{{"} — подсказка полей; в превью подставятся демо-значения
          </p>
          <PlaceholderTextarea
            rows={10}
            value={config.messageTemplate}
            onChange={(messageTemplate) => patch({ messageTemplate })}
          />
        </div>
      )}
    </div>
  );
}

const HISTORY_MAX = 80;

/** Редактор бланка: формат → настройки + живое превью (controlled). */
export function BlankConstructorEditor({
  config,
  onChange,
  readOnly = false,
  /** После сохранения шаблона — зафиксировать «сохранённую» версию бланка. */
  savedRevision = 0,
}: {
  config: BlankConfig;
  onChange: (next: BlankConfig) => void;
  readOnly?: boolean;
  savedRevision?: number;
}) {
  const [step, setStep] = useState<"format" | "config">(config.format ? "config" : "format");
  const [baseline, setBaseline] = useState(() => cloneConfig(config));
  const [undoAfterReset, setUndoAfterReset] = useState<BlankConfig | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);

  const historyRef = useRef<BlankConfig[]>([cloneConfig(config)]);
  const histIndexRef = useRef(0);
  const applyingHistoryRef = useRef(false);

  const resetHistory = useCallback((c: BlankConfig) => {
    historyRef.current = [cloneConfig(c)];
    histIndexRef.current = 0;
    setHistoryTick((n) => n + 1);
  }, []);

  const pushHistory = useCallback((next: BlankConfig) => {
    if (applyingHistoryRef.current) return;
    const cur = historyRef.current[histIndexRef.current];
    if (cur && sameConfig(cur, next)) return;
    const sliced = historyRef.current.slice(0, histIndexRef.current + 1);
    sliced.push(cloneConfig(next));
    while (sliced.length > HISTORY_MAX) sliced.shift();
    historyRef.current = sliced;
    histIndexRef.current = sliced.length - 1;
    setHistoryTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (savedRevision <= 0) return;
    setBaseline(cloneConfig(config));
    setUndoAfterReset(null);
    resetHistory(config);
    // только тик сохранения: config берём актуальный в этот момент
  }, [savedRevision]); // eslint-disable-line react-hooks/exhaustive-deps -- см. выше

  const dirty = !sameConfig(config, baseline);
  const canUndoReset = undoAfterReset !== null;
  const canHistoryUndo = historyTick >= 0 && histIndexRef.current > 0;
  const canHistoryRedo =
    historyTick >= 0 && histIndexRef.current < historyRef.current.length - 1;

  const applyConfig = (next: BlankConfig) => {
    onChange(next);
    setStep(next.format ? "config" : "format");
  };

  const commit = (next: BlankConfig) => {
    pushHistory(next);
    onChange(next);
  };

  const patch = (p: Partial<BlankConfig>) => commit({ ...config, ...p });

  const historyUndo = useCallback(() => {
    if (histIndexRef.current <= 0) return false;
    histIndexRef.current -= 1;
    applyingHistoryRef.current = true;
    const prev = cloneConfig(historyRef.current[histIndexRef.current]!);
    applyConfig(prev);
    setHistoryTick((n) => n + 1);
    queueMicrotask(() => {
      applyingHistoryRef.current = false;
    });
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- applyConfig via onChange/setStep

  const historyRedo = useCallback(() => {
    if (histIndexRef.current >= historyRef.current.length - 1) return false;
    histIndexRef.current += 1;
    applyingHistoryRef.current = true;
    const next = cloneConfig(historyRef.current[histIndexRef.current]!);
    applyConfig(next);
    setHistoryTick((n) => n + 1);
    queueMicrotask(() => {
      applyingHistoryRef.current = false;
    });
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFormat = (format: BlankFormat) => {
    if (readOnly) return;
    if (config.format === format) {
      setStep("config");
      return;
    }
    const engine = defaultEngineForFormat(format);
    const base = engine ? presetConfigForEngine(engine) : defaultConfig(format);
    const keepOutgoing =
      (format === "word_table" || format === "word_fax") &&
      (config.format === "word_table" || config.format === "word_fax");
    commit({
      ...base,
      format,
      letterhead: config.letterhead,
      showDirectorBlock: config.showDirectorBlock,
      ...(keepOutgoing
        ? {
            showOutgoing: config.showOutgoing,
            outNumber: config.outNumber,
            letterDate: config.letterDate,
          }
        : {}),
    });
    setStep("config");
  };

  const doReset = () => {
    if (readOnly) return;
    setUndoAfterReset(cloneConfig(config));
    const next = defaultConfig();
    commit(next);
    setStep("format");
    setConfirmReset(false);
  };

  const undoReset = () => {
    if (!undoAfterReset) return;
    commit(cloneConfig(undoAfterReset));
    setStep(undoAfterReset.format ? "config" : "format");
    setUndoAfterReset(null);
  };

  const discardChanges = () => {
    applyingHistoryRef.current = true;
    applyConfig(cloneConfig(baseline));
    resetHistory(baseline);
    setUndoAfterReset(null);
    queueMicrotask(() => {
      applyingHistoryRef.current = false;
    });
  };

  const undoResetRef = useRef(undoReset);
  undoResetRef.current = undoReset;
  const discardRef = useRef(discardChanges);
  discardRef.current = discardChanges;
  const historyUndoRef = useRef(historyUndo);
  historyUndoRef.current = historyUndo;
  const historyRedoRef = useRef(historyRedo);
  historyRedoRef.current = historyRedo;
  const canUndoResetRef = useRef(canUndoReset);
  canUndoResetRef.current = canUndoReset;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key.toLowerCase() !== "z" && e.key.toLowerCase() !== "я") return;
      // ⌘Z / Ctrl+Z — шаг назад; ⌘⇧Z — вперёд (и в textarea: controlled value ломает нативный undo)
      e.preventDefault();
      if (e.shiftKey) {
        historyRedoRef.current();
        return;
      }
      if (canUndoResetRef.current) {
        undoResetRef.current();
        return;
      }
      if (!historyUndoRef.current() && dirtyRef.current) discardRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep("format")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              step === "format"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            1. Формат
          </button>
          <button
            type="button"
            onClick={() => config.format && setStep("config")}
            disabled={!config.format}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
              step === "config"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            2. Настройки
          </button>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {canUndoReset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={undoReset}
                title="⌘Z"
              >
                <Undo2 className="size-3.5" />
                Вернуть бланк
              </Button>
            ) : null}
            {canHistoryUndo && !canUndoReset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => historyUndo()}
                title="⌘Z · ⌘⇧Z вперёд"
              >
                <Undo2 className="size-3.5" />
                Отменить
              </Button>
            ) : null}
            {dirty && !canUndoReset && !canHistoryUndo ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={discardChanges}
                title="⌘Z"
              >
                <Undo2 className="size-3.5" />
                Отменить изменения
              </Button>
            ) : null}
            {dirty && !canUndoReset && canHistoryUndo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={discardChanges}
                title="Вернуть к последнему сохранению"
              >
                К сохранённому
              </Button>
            ) : null}
            {canHistoryRedo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => historyRedo()}
                title="⌘⇧Z"
              >
                Повторить
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="size-3.5" /> Сбросить бланк
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div
          className={cn(
            "min-w-0 space-y-4 rounded-lg border border-border bg-card p-4",
            readOnly && "pointer-events-none opacity-80",
          )}
        >
          {step === "format" ? (
            <FormatStep format={config.format} onPick={pickFormat} />
          ) : (
            <ConfigStep config={config} patch={patch} />
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Превью
            </p>
            {config.format && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Тип бланка:</span>{" "}
                <span className="font-medium">{formatLabel(config.format)}</span>
              </p>
            )}
          </div>
          <BlankConstructorPreview config={config} />
        </div>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить бланк?</AlertDialogTitle>
            <AlertDialogDescription>
              Настройки и содержимое бланка очистятся. Можно будет нажать «Вернуть бланк», пока не
              сохраните шаблон.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={doReset}>Сбросить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
