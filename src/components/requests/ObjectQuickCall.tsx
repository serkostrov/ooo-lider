import { useState } from "react";
import { Phone } from "lucide-react";
import { useRequestTypes } from "@/components/directories/request-types/data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewRequestDialog } from "./NewRequestDialog";

const NONE = "__pick";

/** Компактный выбор вида вызова → диалог новой заявки. */
export function ObjectQuickCall({ objectId }: { objectId: string }) {
  const { data: types = [] } = useRequestTypes();
  const active = types.filter((t) => t.is_active);
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState<string | undefined>();

  if (active.length === 0) return null;

  return (
    <>
      <NewRequestDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setTypeId(undefined);
        }}
        objectId={objectId}
        typeId={typeId}
      />
      <Select
        value={NONE}
        onValueChange={(id) => {
          if (id === NONE) return;
          setTypeId(id);
          setOpen(true);
        }}
      >
        <SelectTrigger className="h-9 w-[11.5rem] text-sm">
          <Phone className="size-3.5 shrink-0 opacity-70" />
          <SelectValue placeholder="Создать вызов" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="hidden">
            Создать вызов
          </SelectItem>
          {active.map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-sm">
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
