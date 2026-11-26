import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showError } from "@/lib/format";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { emptyToNull, isHexColor, matches } from "./rules";

export { emptyToNull, isHexColor, matches };

export function Toolbar({
  search,
  onSearch,
  onAdd,
  addLabel = "Добавить",
  children,
  className,
  /** Одна строка: поиск сжимается, кнопки не переносятся. */
  nowrap = false,
  /** Классы обёртки поля поиска (например max-w-*). */
  searchClassName,
  /** Поиск слева, действия (children + Добавить) справа. */
  split = false,
}: {
  search: string;
  onSearch: (v: string) => void;
  onAdd?: (() => void) | undefined;
  addLabel?: string;
  children?: ReactNode;
  className?: string;
  nowrap?: boolean;
  searchClassName?: string;
  split?: boolean;
}) {
  const actions =
    children || onAdd ? (
      <>
        {children}
        {onAdd ? (
          <Button onClick={onAdd} className="h-9 shrink-0 gap-1.5 px-3 text-sm">
            <Plus className="size-4" />
            {addLabel}
          </Button>
        ) : null}
      </>
    ) : null;

  return (
    <div
      className={cn(
        "mb-4 flex w-full items-center gap-1.5 sm:gap-3",
        nowrap ? "flex-nowrap" : "flex-wrap",
        split && "justify-between",
        className,
      )}
    >
      <div
        className={cn(
          "relative min-w-0",
          split ? "w-full max-w-[16rem] shrink-0" : "flex-1",
          !split && (nowrap ? "basis-0" : "basis-48"),
          searchClassName,
        )}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground sm:left-3" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Поиск"
          className={cn(
            "h-9 w-full pl-9 text-sm sm:pl-11",
            search ? "pr-8 sm:pr-9" : undefined,
          )}
        />
        {search ? (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground sm:right-2"
            onClick={() => onSearch("")}
            aria-label="Очистить поиск"
            title="Очистить"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      {actions ? (
        split ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-3">{actions}</div>
        ) : (
          actions
        )
      ) : null}
    </div>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className={fieldStackClass}>
      <Label className={fieldLabelClass}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

/** Список значений: отдельный инпут на каждый + «Добавить ещё» + корзина. */
export function MultiValueInputs({
  values,
  onChange,
  placeholder,
  addLabel = "Добавить ещё",
  inputClassName,
  type = "text",
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  inputClassName?: string;
  type?: "text" | "email" | "tel";
}) {
  const rows = values.length ? values : [""];
  const setAt = (i: number, value: string) => {
    const next = [...rows];
    next[i] = value;
    onChange(next);
  };
  const removeAt = (i: number) => {
    if (rows.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(rows.filter((_, idx) => idx !== i));
  };
  return (
    <div className="space-y-2">
      {rows.map((val, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type={type}
            value={val}
            onChange={(e) => setAt(i, e.target.value)}
            placeholder={placeholder}
            className={cn("h-9 min-w-0 flex-1 text-sm", inputClassName)}
          />
          {rows.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => removeAt(i)}
              title="Удалить"
              aria-label="Удалить"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-8 gap-1.5 px-2.5 text-sm"
        onClick={() => onChange([...rows, ""])}
      >
        <Plus className="size-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

/** Кружок цвета в таблице справочников. */
export function ColorSwatch({ color, title }: { color: string; title?: string }) {
  return (
    <span
      className="inline-block size-4 rounded-full border border-border"
      style={{ backgroundColor: color }}
      title={title ?? color}
    />
  );
}

/** Поле выбора цвета: picker + hex. */
export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const valid = isHexColor(value);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={valid ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-14 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        aria-label="Выбор цвета"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-10 flex-1 font-mono text-sm" />
    </div>
  );
}

/** Диалог редактирования справочника (вместо выезжающей панели). */
export function EditSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  /** Ширина DialogContent, по умолчанию sm:max-w-xl */
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-xl", className)}>
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="pr-8 text-lg font-semibold tracking-tight">{title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

type SoftTable =
  | "documents"
  | "representatives"
  | "customers"
  | "customer_contacts"
  | "external_contacts"
  | "profiles";

/** Мягкое удаление с подтверждением. */
export function DeleteButton({
  table,
  id,
  name,
  invalidate,
  onDone,
}: {
  table: SoftTable;
  id: string;
  name: string;
  invalidate: string[];
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      // select нужен: без него PostgREST при RLS/miss возвращает «успех» с 0 строк
      const { data, error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Не удалось удалить запись");
    },
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: invalidate });
      setOpen(false);
      onDone?.();
    },
    onError: showError,
  });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-destructive"
        title="Удалить"
        aria-label="Удалить"
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Удалить запись?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">«{name}» будет удалена.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-sm">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="h-9 bg-destructive text-sm text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                m.mutate();
              }}
              disabled={m.isPending}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function FormActions({
  pending,
  onCancel,
  danger,
}: {
  pending: boolean;
  onCancel: () => void;
  /** Справа от «Отмена» — удаление. */
  danger?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border pt-5">
      <Button type="submit" disabled={pending} className="h-10 min-w-0 flex-1 text-sm">
        {pending ? "Сохранение…" : "Сохранить"}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} className="h-10 min-w-0 flex-1 text-sm">
        Отмена
      </Button>
      {danger}
    </div>
  );
}

export function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-sm text-muted-foreground">
        Ничего не найдено
      </td>
    </tr>
  );
}
