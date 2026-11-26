import { GripVertical, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Включает ручки перетаскивания в справочнике. Пока выключено — порядок не меняется. */
export function ReorderModeButton({
  active,
  onChange,
  disabled,
}: {
  active: boolean;
  onChange: (active: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      className="h-9 gap-1.5 px-3 text-sm"
      aria-pressed={active}
      disabled={disabled}
      title={disabled ? "Сбросьте поиск, чтобы менять порядок" : active ? "Закончить перемещение" : "Изменить порядок"}
      onClick={() => onChange(!active)}
    >
      <GripVertical className="size-4" />
      {active ? "Готово" : "Порядок"}
    </Button>
  );
}

/** Режим правки номеров этапов на объекте. */
export function NumbersModeButton({
  active,
  onChange,
  disabled,
}: {
  active: boolean;
  onChange: (active: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      className="h-9 gap-1.5 px-3 text-sm"
      aria-pressed={active}
      disabled={disabled}
      title={active ? "Закончить правку номеров" : "Изменить номера этапов"}
      onClick={() => onChange(!active)}
    >
      <Hash className="size-4" />
      {active ? "Готово" : "Номера"}
    </Button>
  );
}
