import { useRef } from "react";
import { FileText, Paperclip, RotateCcw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatSize, openTemplateFile, type TemplateFile } from "@/lib/files";
import { showError } from "@/lib/format";
import { Field } from "../common";

export type StagedFile = { key: string; file: File };

/** Подпись документа без расширения — для поля «название», если его не заполнили. */
export function docTitleFromFile(name: string) {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

/**
 * «От нас» / «Ждём» в карточке этапа справочника (правка 2.3): название документа
 * + сколько угодно файлов-образцов. Изменения файлов копятся и применяются по «Сохранить»:
 * новый файл можно убрать до сохранения, удаление существующего — отменить («Вернуть»).
 */
export function TemplateDocField({
  label,
  hint,
  name,
  onName,
  existing,
  added,
  removed,
  onAdd,
  onDropAdded,
  onToggleRemoved,
  readOnly,
}: {
  label: string;
  hint: string;
  name: string;
  onName: (v: string) => void;
  existing: TemplateFile[];
  added: StagedFile[];
  removed: Set<string>;
  onAdd: (files: File[]) => void;
  onDropAdded: (key: string) => void;
  onToggleRemoved: (id: string) => void;
  readOnly: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const none = existing.length === 0 && added.length === 0;

  return (
    <Field label={label}>
      <div className="space-y-3 rounded-lg border border-border/80 bg-background/40 p-4">
        <Input
          value={name}
          onChange={(e) => onName(e.target.value)}
          disabled={readOnly}
          placeholder="Название документа"
          className="h-9 text-sm"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>

        {none && readOnly && <p className="text-sm text-muted-foreground">Файлов нет</p>}

        {(existing.length > 0 || added.length > 0) && (
          <ul className="space-y-1">
            {existing.map((f) => {
              const gone = removed.has(f.id);
              return (
                <li key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    disabled={gone}
                    onClick={() => openTemplateFile(f.storage_path).catch(showError)}
                    className={`min-w-0 flex-1 truncate text-left ${gone ? "text-muted-foreground line-through" : "text-primary hover:underline"}`}
                    title={f.file_name}
                  >
                    {f.file_name}
                  </button>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {gone ? "будет удалён" : formatSize(f.size_bytes)}
                  </span>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={() => onToggleRemoved(f.id)}
                      aria-label={gone ? "Вернуть файл" : "Удалить файл"}
                      title={gone ? "Вернуть" : "Удалить"}
                    >
                      {gone ? <RotateCcw className="size-3.5" /> : <X className="size-3.5" />}
                    </Button>
                  )}
                </li>
              );
            })}
            {added.map((a) => (
              <li key={a.key} className="flex items-center gap-2 rounded-md bg-primary/5 px-2 py-1 text-sm">
                <FileText className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate" title={a.file.name}>{a.file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">новый, {formatSize(a.file.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => onDropAdded(a.key)}
                  aria-label="Убрать файл"
                  title="Убрать"
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {!readOnly && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onAdd(files);
                e.target.value = ""; // тот же файл можно выбрать ещё раз
              }}
            />
            <Button type="button" variant="outline" size="icon" onClick={() => input.current?.click()} title="Прикрепить файлы" aria-label="Прикрепить файлы">
              <Paperclip className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </Field>
  );
}
