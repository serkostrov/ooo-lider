import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditSheet } from "@/components/directories/common";
import {
  ExternalContactForm,
  useExternalContacts,
  type ExternalContact,
} from "@/components/directories/ExternalContactsDirectory";
import { useProfile } from "@/lib/profile";

const stageContactsKey = (stageId: string) => ["stage-external-contacts", stageId] as const;

type LinkRow = {
  id: string;
  contact_id: string;
  contact: ExternalContact | null;
};

export function StageExternalContacts({
  stageId,
  canEdit,
}: {
  stageId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { is_admin } = useProfile();
  const [pick, setPick] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: links = [], isLoading } = useQuery({
    queryKey: stageContactsKey(stageId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("object_stage_external_contacts")
        .select(
          "id, contact_id, contact:external_contacts(id, full_name, position, phone, email, comment, is_active, deleted_at)",
        )
        .eq("stage_id", stageId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((row) => {
        const raw = row as {
          id: string;
          contact_id: string;
          contact:
            | (ExternalContact & { deleted_at: string | null })
            | (ExternalContact & { deleted_at: string | null })[]
            | null;
        };
        const c = Array.isArray(raw.contact) ? raw.contact[0] ?? null : raw.contact;
        return {
          id: raw.id,
          contact_id: raw.contact_id,
          contact: c && !c.deleted_at ? c : null,
        } satisfies LinkRow;
      });
    },
  });

  const { data: catalog = [] } = useExternalContacts(true);
  const linkedIds = useMemo(() => new Set(links.map((l) => l.contact_id)), [links]);
  const available = catalog.filter((c) => !linkedIds.has(c.id));
  const picked = available.find((c) => c.id === pick) ?? null;

  const contactSearchValue = (c: ExternalContact) =>
    [c.full_name, c.position, c.phone, c.email, c.comment, c.customer_name]
      .filter(Boolean)
      .join(" ");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: stageContactsKey(stageId) });
  };

  const add = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from("object_stage_external_contacts").insert({
        stage_id: stageId,
        contact_id: contactId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Контакт добавлен к этапу");
      setPick("");
      invalidate();
    },
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("object_stage_external_contacts")
        .delete()
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Контакт отвязан");
      invalidate();
    },
    onError: showError,
  });

  const visible = links.filter((l) => l.contact);

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">К этапу пока не привязаны внешние контакты</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {visible.map((l) => {
            const c = l.contact!;
            return (
              <li
                key={l.id}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.position, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(l.id)}
                    title="Отвязать от этапа"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {available.length > 0 ? (
            <>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="h-9 w-full max-w-xs justify-between px-3 text-sm font-normal"
                  >
                    <span className={cn("truncate", !picked && "text-muted-foreground")}>
                      {picked
                        ? `${picked.full_name}${picked.position ? ` · ${picked.position}` : ""}`
                        : "Выбрать из справочника"}
                    </span>
                    <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
                  <Command
                    filter={(value, search) =>
                      value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
                    }
                  >
                    <CommandInput placeholder="Поиск: ФИО, должность, телефон, почта…" className="h-9 text-sm" />
                    <CommandList className="max-h-72">
                      <CommandEmpty className="py-4 text-center text-sm">Ничего не найдено</CommandEmpty>
                      {available.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={contactSearchValue(c)}
                          onSelect={() => {
                            setPick(c.id);
                            setPickerOpen(false);
                          }}
                          className="flex flex-col items-start gap-0.5 py-2 text-sm"
                        >
                          <span className="font-medium">{c.full_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {[c.position, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                disabled={!pick || add.isPending}
                onClick={() => pick && add.mutate(pick)}
              >
                Привязать
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {catalog.length === 0
                ? "Справочник пуст — создайте контакт"
                : "Все активные контакты уже привязаны"}
            </p>
          )}
          {is_admin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-3.5" />
              Новый контакт
            </Button>
          ) : null}
        </div>
      ) : null}

      <EditSheet
        open={creating}
        onOpenChange={setCreating}
        title="Новый внешний контакт"
      >
        {creating ? (
          <ExternalContactForm
            contact={null}
            onClose={() => setCreating(false)}
            onSaved={(c) => {
              add.mutate(c.id);
            }}
          />
        ) : null}
      </EditSheet>
    </div>
  );
}
