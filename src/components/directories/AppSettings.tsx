import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useSetShowOverdueGate, useShowOverdueGate } from "@/lib/ui-settings";

/** Личные переключатели текущего сотрудника. Хранятся в user_settings. */
export function AppSettings() {
  const { data: saved, isPending } = useShowOverdueGate();
  const save = useSetShowOverdueGate();
  const [showOverdue, setShowOverdue] = useState(true);

  useEffect(() => {
    if (saved !== undefined) setShowOverdue(saved);
  }, [saved]);

  const toggleOverdue = (on: boolean) => {
    const prev = showOverdue;
    setShowOverdue(on);
    save.mutate(on, {
      onError: () => setShowOverdue(prev),
    });
  };

  return (
    <div className="max-w-xl rounded-xl border border-border/70 bg-card p-5 shadow-[var(--surface-glow)]">
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            Показывать окно «Просрочено» при входе
          </span>
          <span className="mt-1 block text-sm leading-snug text-muted-foreground">
            После входа на весь экран открывается список просроченных этапов и заявок. Раздел
            «Просрочено» и колокольчик остаются. Флаг сохраняется для вашего входа.
          </span>
        </span>
        <Switch
          checked={showOverdue}
          disabled={isPending || save.isPending}
          onCheckedChange={toggleOverdue}
          className="mt-0.5 shrink-0"
          aria-label="Показывать окно «Просрочено» при входе"
        />
      </label>
    </div>
  );
}
