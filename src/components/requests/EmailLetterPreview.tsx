import { FileSpreadsheet, FileText, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function fileIcon(filename: string | null | undefined) {
  const lower = (filename ?? "").toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return FileSpreadsheet;
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return FileText;
  return Paperclip;
}

/** Карточка-превью письма: тема, текст, вложение. Можно править прямо в карточке. */
export function EmailLetterPreview({
  to,
  title,
  subtitle,
  filename,
  className,
  editable = false,
  onTitleChange,
  onSubtitleChange,
}: {
  to?: string | null;
  title: string;
  subtitle: string;
  filename?: string | null;
  className?: string;
  editable?: boolean;
  onTitleChange?: (v: string) => void;
  onSubtitleChange?: (v: string) => void;
}) {
  const Icon = fileIcon(filename);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-muted/25 text-sm",
        className,
      )}
    >
      <div className="space-y-1.5 border-b border-border bg-card/60 px-3 py-2.5">
        {to ? (
          <p className="text-xs text-muted-foreground">
            Кому: <span className="text-foreground">{to}</span>
          </p>
        ) : null}
        {editable ? (
          <Input
            value={title}
            onChange={(e) => onTitleChange?.(e.target.value)}
            placeholder="Тема письма"
            className="h-auto border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:ring-0"
          />
        ) : (
          <p className="font-medium leading-snug text-foreground">
            {title.trim() || "Тема письма"}
          </p>
        )}
      </div>
      {editable ? (
        <Textarea
          value={subtitle}
          onChange={(e) => onSubtitleChange?.(e.target.value)}
          placeholder="Текст письма…"
          rows={8}
          className="min-h-[10rem] resize-y rounded-none border-0 bg-transparent px-3 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        />
      ) : (
        <div className="whitespace-pre-wrap px-3 py-3 text-sm leading-relaxed text-foreground/90">
          {subtitle.trim() || "Текст письма…"}
        </div>
      )}
      {filename ? (
        <div className="border-t border-border px-3 py-2.5">
          <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate text-xs font-medium">{filename}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
