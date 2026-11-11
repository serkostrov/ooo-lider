import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { isOptionalEmail, VALIDATION_MSG } from "@/lib/validation";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Field, emptyToNull } from "../common";
import { REQUEST_TYPES_KEY, type RequestType } from "./data";

export function RequestTypeForm({
  type,
  allTypes,
  readOnly,
  onCreated,
}: {
  type: RequestType | null;
  allTypes: RequestType[];
  readOnly: boolean;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(type?.name ?? "");
  const [email, setEmail] = useState(type?.send_to_email ?? "");
  const [usesReps, setUsesReps] = useState(type?.uses_representatives ?? false);
  const [active, setActive] = useState(type?.is_active ?? true);

  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Укажите название вида заявки");
      if (!isOptionalEmail(email)) throw new Error(VALIDATION_MSG.email);
      const payload = {
        name: name.trim(),
        send_to_email: emptyToNull(email),
        uses_representatives: usesReps,
        is_active: active,
      };
      if (type) {
        const { error } = await supabase.from("request_types").update(payload).eq("id", type.id);
        if (error) throw error;
        return type.id;
      }
      const sort = allTypes.reduce((mx, t) => Math.max(mx, t.sort), 0) + 1;
      const { data, error } = await supabase
        .from("request_types")
        .insert({ ...payload, sort })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async (id) => {
      toast.success("Сохранено");
      await qc.invalidateQueries({ queryKey: REQUEST_TYPES_KEY });
      if (!type) onCreated(id);
    },
    onError: showError,
  });

  return (
    <form
      className="w-full space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Field label="Название (надпись на кнопке)" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} className="h-9 text-sm" />
      </Field>
      <Field label="Адрес отправки (email)">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={readOnly}
          type="email"
          placeholder="Куда офис-менеджер отправляет заявку"
          className="h-9 text-sm"
        />
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={usesReps} onCheckedChange={setUsesReps} disabled={readOnly} />
        Выбор «кого вызываем» из справочника представителей
      </label>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={active} onCheckedChange={setActive} disabled={readOnly} /> Активен
      </label>
      {!active && (
        <p className="text-sm text-muted-foreground">
          Неактивный вид не показывается кнопкой на объекте. Созданные заявки этого вида сохраняются.
        </p>
      )}
      {!readOnly && (
        <Button type="submit" disabled={m.isPending} className="h-9 w-full text-sm">
          {m.isPending ? "Сохранение…" : "Сохранить"}
        </Button>
      )}
    </form>
  );
}
