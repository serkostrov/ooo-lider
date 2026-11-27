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
  childrenOf,
  isGroupKind,
  kindLabel,
  topLevelContacts,
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
          "id, contact_id, contact:external_contacts(id, kind, full_name, position, phone, email, comment, customer_id, parent_id, is_active, deleted_at)",
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
          contact: c && !c.deleted_at
            ? {
                ...c,
                kind: c.kind,
                customer_name: null,
                parent_id: c.parent_id ?? null,
              }
            : null,
        } satisfies LinkRow;
      });
    },
  });

  const { data: catalog = [] } = useExternalContacts(true);
  const linkedIds = useMemo(() => new Set(links.map((l) => l.contact_id)), [links]);
  const available = useMemo(
    () => topLevelContacts(catalog).filter((c) => !linkedIds.has(c.id)),
    [catalog, linkedIds],
  );
  const picked = available.find((c) => c.id === pick) ?? null;

  const contactSearchValue = (c: ExternalContact) => {
    const kids = isGroupKind(c.kind) ? childrenOf(catalog, c.id) : [];
    return [
      c.full_name,
      c.position,
      c.phone,
      c.email,
      c.comment,
      c.customer_name,
      kindLabel(c.kind),
      ...kids.flatMap((k) => [k.full_name, k.position, k.phone, k.email]),
    ]
      .filter(Boolean)
      .join(" ");
  };

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
    onSuccess: (_d, contactId) => {
      const c = catalog.find((x) => x.id === contactId);
      toast.success(
        c && isGroupKind(c.kind) ? "Группа добавлена к этапу" : "Контакт добавлен к этапу",
      );
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
      toast.success("Отвязано от этапа");
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
            const kids =
              isGroupKind(c.kind) ? childrenOf(catalog, c.id).filter((k) => k.is_active) : [];
            return (
              <li key={l.id} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.full_name}
                      {isGroupKind(c.kind) ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {kindLabel(c.kind)}
                          {kids.length > 0 ? ` · ${kids.length} чел.` : ""}
                        </span>
                      ) : null}
                    </p>
                    {!isGroupKind(c.kind) ? (
                      <p className="text-xs text-muted-foreground">
                        {[c.position, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                      </p>
                    ) : c.position ? (
                      <p className="text-xs text-muted-foreground">{c.position}</p>
                    ) : null}
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
                </div>
                {kids.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
                    {kids.map((k) => (
                      <li key={k.id} className="min-w-0">
                        <p className="text-sm font-medium">{k.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[k.position, k.phone, k.email].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
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
                        ? isGroupKind(picked.kind)
                          ? `${picked.full_name} · ${kindLabel(picked.kind)}`
                          : `${picked.full_name}${picked.position ? ` · ${picked.position}` : ""}`
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
                    <CommandInput
                      placeholder="Поиск: группа, ФИО, телефон…"
                      className="h-9 text-sm"
                    />
                    <CommandList className="max-h-72">
                      <CommandEmpty className="py-4 text-center text-sm">
                        Ничего не найдено
                      </CommandEmpty>
                      {available.map((c) => {
                        const kids = isGroupKind(c.kind)
                          ? childrenOf(catalog, c.id)
                          : [];
                        return (
                          <CommandItem
                            key={c.id}
                            value={contactSearchValue(c)}
                            onSelect={() => {
                              setPick(c.id);
                              setPickerOpen(false);
                            }}
                            className="flex flex-col items-start gap-0.5 py-2 text-sm"
                          >
                            <span className="font-medium">
                              {c.full_name}
                              {isGroupKind(c.kind) ? (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  {kindLabel(c.kind)}
                                  {kids.length > 0 ? ` · ${kids.length} чел.` : ""}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {isGroupKind(c.kind)
                                ? kids.length
                                  ? kids.map((k) => k.full_name).join(", ")
                                  : "Группа без людей"
                                : [c.position, c.phone, c.email].filter(Boolean).join(" · ") ||
                                  "—"}
                            </span>
                          </CommandItem>
                        );
                      })}
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
