import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Upload } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import {
  FILE_KIND_LABEL,
  formatSize,
  openFile,
  uploadFile,
  type FileEntity,
  type FileKind,
  type FileRow,
} from "@/lib/files";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function useStageFileUpload({
  objectId,
  entityType,
  entityId,
  onUploaded,
}: {
  objectId: string;
  entityType: FileEntity;
  entityId: string;
  onUploaded: () => void;
}) {
  const { id: profileId } = useProfile();
  return useMutation({
    mutationFn: async ({ files, kind }: { files: File[]; kind: FileKind }) => {
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`Файл «${file.name}» больше 50 МБ`);
        await uploadFile({ objectId, entityType, entityId, kind, file, profileId });
      }
      return files.length;
    },
    onSuccess: (n) => {
      toast.success(n > 1 ? `Загружено файлов: ${n}` : "Файл загружен");
      onUploaded();
    },
    onError: showError,
  });
}

/** Кнопка загрузки файла (несколько файлов за раз; на iPad открывает камеру/галерею/файлы). */
export function UploadButton({
  objectId,
  entityType,
  entityId,
  kind,
  label,
  onUploaded,
  variant = "outline",
  className = "h-9 text-sm",
}: {
  objectId: string;
  entityType: FileEntity;
  entityId: string;
  kind: FileKind;
  label: string;
  onUploaded: () => void;
  variant?: "outline" | "default" | "secondary";
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useStageFileUpload({ objectId, entityType, entityId, onUploaded });
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) upload.mutate({ files, kind });
          if (input.current) input.current.value = "";
        }}
      />
      <Button
        type="button"
        variant={variant}
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
        className={className}
      >
        {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {label}
      </Button>
    </>
  );
}

/** Зона DnD: перетащить файлы как черновик или подписанный скан. */
export function StageFilesDropZones({
  objectId,
  entityId,
  onUploaded,
  children,
}: {
  objectId: string;
  entityId: string;
  onUploaded: () => void;
  children?: ReactNode;
}) {
  const upload = useStageFileUpload({
    objectId,
    entityType: "stage",
    entityId,
    onUploaded,
  });
  const busy = upload.isPending;
  const activeKind = upload.isPending ? upload.variables?.kind : undefined;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <DropTarget
          kind="draft"
          title="Черновик на согласование"
          hint="Перетащить или выбрать · PDF, фото, Word…"
          disabled={busy}
          {...(activeKind ? { activeKind } : {})}
          onFiles={(files) => upload.mutate({ files, kind: "draft" })}
        />
        <DropTarget
          kind="signed"
          title="Подписанный скан"
          hint="Перетащить или выбрать · PDF, фото"
          emphasize
          disabled={busy}
          {...(activeKind ? { activeKind } : {})}
          onFiles={(files) => upload.mutate({ files, kind: "signed" })}
        />
      </div>
      {children}
    </div>
  );
}

function DropTarget({
  kind,
  title,
  hint,
  emphasize,
  disabled,
  activeKind,
  onFiles,
}: {
  kind: FileKind;
  title: string;
  hint: string;
  emphasize?: boolean;
  disabled?: boolean;
  activeKind?: FileKind;
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pending = disabled && activeKind === kind;

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) onFiles(files);
    },
    [disabled, onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onClick={() => !disabled && input.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex min-h-[8.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
        over && !disabled
          ? "border-primary bg-primary/10 text-foreground"
          : emphasize
            ? "border-primary/45 bg-primary/5 text-muted-foreground hover:border-primary hover:bg-primary/10"
            : "border-border/80 bg-card/40 text-muted-foreground hover:border-primary/40 hover:bg-muted/30",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          if (input.current) input.current.value = "";
        }}
      />
      {pending ? (
        <Loader2 className="size-6 animate-spin text-primary" />
      ) : (
        <Upload className={cn("size-6", over ? "text-primary" : "opacity-70")} />
      )}
      <div className="space-y-0.5">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs">{pending ? "Загрузка…" : hint}</div>
      </div>
    </div>
  );
}

export function FileList({ files, showKind }: { files: FileRow[]; showKind?: boolean }) {
  if (files.length === 0) return null;
  return (
    <ul className="divide-y overflow-hidden rounded-md border border-border bg-card">
      {files.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <button
            type="button"
            onClick={() => openFile(f.storage_path).catch(showError)}
            className="inline-flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-primary hover:underline"
          >
            <FileText className="size-4 shrink-0" />
            <span className="truncate">{f.file_name}</span>
          </button>
          {showKind && <span className="text-xs font-medium">{FILE_KIND_LABEL[f.kind]}</span>}
          <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {f.uploader?.full_name && <span>{f.uploader.full_name}</span>}
            <span>{formatDateTime(f.created_at)}</span>
            {f.size_bytes ? <span>{formatSize(f.size_bytes)}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
