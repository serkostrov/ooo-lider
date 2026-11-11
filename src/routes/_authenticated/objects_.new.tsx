import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OBJECTS_KEY } from "@/components/objects/data";
import {
  EMPTY_DRAFT,
  ObjectCardFields,
  draftToPayload,
  validateDraft,
  type ObjectDraft,
} from "@/components/objects/ObjectCardFields";
import { MembersPicker } from "@/components/objects/MembersPicker";
import { StagesPicker, useAvailableTemplates } from "@/components/objects/StagesPicker";

export const Route = createFileRoute("/_authenticated/objects_/new")({
  component: NewObjectPage,
  head: () => ({ meta: [{ title: "Новый объект — Лидер" }] }),
});

const STEPS = ["Карточка", "Участники", "Этапы"] as const;

function NewObjectPage() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ObjectDraft>(EMPTY_DRAFT);
  const [members, setMembers] = useState<string[]>([]);
  const [stageIds, setStageIds] = useState<string[] | null>(null);
  const { templates, isLoading } = useAvailableTemplates();

  // По умолчанию отмечены все активные этапы
  useEffect(() => {
    if (!isLoading && stageIds === null) setStageIds(templates.map((t) => t.id));
  }, [isLoading, templates, stageIds]);

  const create = useMutation({
    mutationFn: async () => {
      const err = validateDraft(draft);
      if (err) throw new Error(err);
      const payload = draftToPayload(draft);
      const memberIds = [...new Set([...members, ...(payload.responsible_id ? [payload.responsible_id] : [])])];
      const { data, error } = await supabase.rpc("create_object", {
        p_object: payload,
        p_member_ids: memberIds,
        p_template_ids: stageIds ?? [],
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (id) => {
      toast.success("Объект создан");
      await qc.invalidateQueries({ queryKey: OBJECTS_KEY });
      navigate({ to: "/objects/$id", params: { id } });
    },
    onError: showError,
  });

  const back = (
    <Link to="/objects" className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">
      <ArrowLeft className="size-4" /> К объектам
    </Link>
  );

  if (!is_admin) {
    return (
      <div>
        {back}
        <p className="py-10 text-base text-muted-foreground">
          Создавать объекты может только администратор или руководитель
        </p>
      </div>
    );
  }

  const next = () => {
    if (step === 0) {
      const err = validateDraft(draft);
      if (err) {
        toast.error(err);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
        {back}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Новый объект</h1>
          <ol className="inline-flex items-center gap-1 rounded-lg bg-muted/80 p-0.5">
            {STEPS.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => (done ? setStep(i) : i === step + 1 ? next() : undefined)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                      active && "bg-card text-foreground",
                      done && !active && "text-primary hover:text-primary",
                      !active && !done && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-3.5 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums",
                        active
                          ? "bg-signal text-[oklch(0.18_0.02_240)]"
                          : done
                            ? "bg-primary/15 text-primary"
                            : "bg-muted-foreground/20 text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="size-2" strokeWidth={3} /> : i + 1}
                    </span>
                    {s}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-w-0">
          {step === 0 && <ObjectCardFields value={draft} onChange={setDraft} />}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Участники видят объект и его заявки. Исполнители этапов подставятся автоматически по ролям из регламента.
              </p>
              <MembersPicker
                value={members}
                onToggle={(id, on) => setMembers((m) => (on ? [...m, id] : m.filter((x) => x !== id)))}
              />
            </div>
          )}
          {step === 2 && <StagesPicker templates={templates} selected={stageIds ?? []} onChange={setStageIds} />}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="h-9 px-4 text-sm">
              Назад
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} className="h-9 px-5 text-sm">
              Далее
            </Button>
          ) : (
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="h-9 px-5 text-sm">
              {create.isPending ? "Создание…" : `Создать объект (${stageIds?.length ?? 0} этапов)`}
            </Button>
          )}
          <Button asChild variant="outline" className="ml-auto h-9 px-4 text-sm">
            <Link to="/objects">Отмена</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
