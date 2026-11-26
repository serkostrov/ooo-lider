import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, RotateCcw, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { isValidEmail, looksLikeEmailField } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProfile } from "@/lib/profile";
import {
  canAdvanceRequestStatus,
  canRequestStatusBack,
  canSendRequestToRework,
} from "@/lib/permissions";
import {
  scenarioRoleForTransition,
  useRequestTypeScenario,
} from "@/components/directories/request-types/data";
import {
  RequestStatusBadge,
  useRequestFlowStatuses,
  useRequestStatuses,
  type FieldValue,
  type RequestRow,
  type RequestStatusDef,
} from "../data";
import { sendRequestDocEmail } from "@/lib/request-docs/sendRequestDocEmail";
import {
  previewAttachmentFileName,
  resolveEmailSubtitle,
  resolveEmailTitle,
} from "@/lib/request-docs/emailCopy";
import { EmailLetterPreview } from "@/components/requests/EmailLetterPreview";

function useStatusFlow(r: RequestRow) {
  const flow = useRequestFlowStatuses();
  const all = useRequestStatuses();
  const onRework = r.status === "rework";
  // В rework степпер показывает ход до «Готова» (ещё не пройдена заново).
  const effective = onRework ? "ready" : r.status;
  const idx = flow.findIndex((s) => s.v === effective);
  const nextFromFlow = idx >= 0 ? flow[idx + 1] : undefined;
  const prevFromFlow = idx > 0 ? flow[idx - 1] : undefined;
  const reworkDef = all.find((s) => s.v === "rework");
  const readyDef = all.find((s) => s.v === "ready") ?? flow.find((s) => s.v === "ready");

  let next: RequestStatusDef | undefined;
  let prev: RequestStatusDef | undefined;
  if (onRework) {
    next = readyDef
      ? { ...readyDef, next: readyDef.next || "Готова к отправке" }
      : undefined;
    prev = undefined;
  } else {
    next = nextFromFlow;
    // С ready нельзя назад в new — только «На доработку»
    prev = prevFromFlow && prevFromFlow.v !== "new" ? prevFromFlow : undefined;
  }

  return {
    flow,
    idx: onRework ? -1 : idx,
    next,
    prev,
    onRework,
    reworkDef,
    canSendToRework: r.status === "ready" || r.status === "sent" || r.status === "accepted",
  };
}

function whenLines(r: RequestRow, v: string, doneByName: string | null): string[] {
  const lines = (...x: (string | null | undefined)[]) => x.filter((y): y is string => !!y);
  if (v === "new") return lines(formatDateTime(r.created_at), r.initiator_name);
  if (v === "ready") return lines(r.office_name && `Обработал: ${r.office_name}`);
  if (v === "sent") return lines(formatDateTime(r.sent_at));
  if (v === "accepted") return lines(formatDateTime(r.accepted_at));
  if (v === "done") return lines(formatDateTime(r.done_at), doneByName);
  return [];
}

/** Ход статусов заявки — компактная полоса (справа от табов). */
export function RequestStatusStepper({
  r,
  doneByName,
  className,
}: {
  r: RequestRow;
  doneByName: string | null;
  className?: string;
}) {
  const { flow, idx, onRework } = useStatusFlow(r);
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {onRework && (
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatusBadge status="rework" />
          <span className="text-xs text-muted-foreground">Ожидает правок прораба</span>
        </div>
      )}
      <ol className="flex min-w-0 flex-wrap justify-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5 sm:flex-nowrap sm:justify-start">
        {flow.map((s, i) => {
          const done = !onRework && i <= idx;
          const current = !onRework && i === idx;
          // Финал «Исполнена» — зелёный, не «сигнальный» жёлтый текущего шага.
          const finished = current && r.status === "done";
          const active = current && !finished;
          const meta = whenLines(r, s.v, doneByName);
          return (
            <li key={s.v} className="max-w-full sm:min-w-0 sm:flex-1 sm:basis-0">
              <div
                className={cn(
                  "flex h-8 w-full items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-medium transition-colors sm:px-2 sm:text-xs",
                  (active || finished) && "bg-card text-foreground",
                  done && !current && "text-foreground/80",
                  !done && !current && "text-muted-foreground",
                  onRework && "opacity-70",
                )}
                title={[s.label, ...meta].filter(Boolean).join(" · ") || undefined}
              >
                <span
                  className={cn(
                    "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold tabular-nums",
                    active
                      ? "bg-signal text-[oklch(0.18_0.02_240)]"
                      : done || finished
                        ? "bg-success text-success-foreground"
                        : "bg-muted-foreground/20 text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-2" strokeWidth={3} /> : i + 1}
                </span>
                <span className="whitespace-nowrap sm:min-w-0 sm:truncate">{s.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Email из поля заявки «Адрес отправки (email)» / похожих. */
function emailFromFieldValues(values: FieldValue[] | undefined): string {
  if (!values?.length) return "";
  for (const v of values) {
    if (!looksLikeEmailField(v)) continue;
    const raw = typeof v.value === "string" ? v.value.trim() : "";
    if (raw && isValidEmail(raw)) return raw;
  }
  return "";
}

/** Действия смены статуса для sticky-бара. Результат/протокол — в форме, не здесь. */
export function RequestStatusActions({
  r,
  missingRequired,
  onChanged,
  beforeChange,
  resultText,
  fieldValues,
  className,
}: {
  r: RequestRow;
  missingRequired: string[];
  onChanged: () => void;
  /** Сохранить черновик полей до смены статуса (иначе «Отправить» теряет несохранённое). */
  beforeChange?: () => Promise<void>;
  /** Черновик результата с формы (пишется в result_text при «Исполнено»). */
  resultText?: string;
  /** Значения полей заявки — чтобы взять «Адрес отправки (email)». */
  fieldValues?: FieldValue[];
  className?: string;
}) {
  const me = useProfile();
  const { next, prev, onRework, canSendToRework, reworkDef } = useStatusFlow(r);
  const { data: scenario = [] } = useRequestTypeScenario(r.request_type_id);
  const scenarioRole = next ? scenarioRoleForTransition(scenario, next.v) : null;
  const [back, setBack] = useState(false);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendByEmail, setSendByEmail] = useState(r.send_by_email !== false);
  const [mailTitle, setMailTitle] = useState("");
  const [mailSubtitle, setMailSubtitle] = useState("");
  const [reason, setReason] = useState("");
  // Обязательные поля шага (сценарий) — блокируют следующий переход.
  const blockedByFields = missingRequired.length > 0 && !!next;
  const canNext = !!next && canAdvanceRequestStatus(me, next.v, scenarioRole);
  const canBack = !!prev && !onRework && canRequestStatusBack(me);
  const canRework = canSendToRework && canSendRequestToRework(me);

  const { data: typeMail } = useQuery({
    queryKey: ["request-type-mail", r.request_type_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_types")
        .select("*")
        .eq("id", r.request_type_id)
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as {
        send_to_email?: string | null;
        send_by_email?: boolean;
        email_title?: string | null;
        email_subtitle?: string | null;
        doc_template?: string | null;
        name?: string | null;
      } | null;
      return {
        email: (row?.send_to_email ?? "").trim(),
        enabled: row?.send_by_email !== false,
        emailTitle: row?.email_title ?? null,
        emailSubtitle: row?.email_subtitle ?? null,
        docTemplate: row?.doc_template ?? null,
        typeName: (row?.name ?? "").trim(),
      };
    },
  });
  const fieldEmail = useMemo(() => emailFromFieldValues(fieldValues), [fieldValues]);
  /** Сначала поле заявки, иначе email вида из справочника. */
  const recipientEmail = fieldEmail || typeMail?.email || "";
  const mailAvailable = !!recipientEmail;
  const attachmentPreview = useMemo(
    () =>
      previewAttachmentFileName(
        typeMail?.docTemplate,
        r.number,
        formatDate(r.call_date),
      ),
    [typeMail?.docTemplate, r.number, r.call_date],
  );

  const openSendDialog = () => {
    const vars = {
      number: r.number,
      type: typeMail?.typeName || r.type_name,
      object: r.object_name ?? "",
      call_date: formatDate(r.call_date),
    };
    setMailTitle(resolveEmailTitle(typeMail?.emailTitle, vars));
    setMailSubtitle(resolveEmailSubtitle(typeMail?.emailSubtitle, vars));
    setSendByEmail(mailAvailable && r.send_by_email !== false);
    setSendOpen(true);
  };

  const m = useMutation({
    mutationFn: async ({
      to,
      comment,
      emailFlag,
      subject,
      text,
    }: {
      to: string;
      comment?: string;
      emailFlag?: boolean;
      subject?: string;
      text?: string;
    }) => {
      await beforeChange?.();
      if (to === "sent" && emailFlag !== undefined) {
        const { error: upErr } = await supabase
          .from("requests")
          .update({ send_by_email: emailFlag } as never)
          .eq("id", r.id);
        if (upErr) throw upErr;
      }
      const args: { p_request_id: string; p_status: string; p_comment?: string } = {
        p_request_id: r.id,
        p_status: to,
      };
      if (comment) args.p_comment = comment;
      const { error } = await supabase.rpc("request_set_status", args);
      if (error) throw error;

      let mailResult: { sent: true; to: string } | { sent: false; error?: string } | null = null;
      if (to === "sent" && emailFlag && recipientEmail) {
        const res = await sendRequestDocEmail({
          r,
          values: fieldValues ?? [],
          to: recipientEmail,
          ...(subject !== undefined ? { subject } : {}),
          ...(text !== undefined ? { text } : {}),
        });
        mailResult = res.ok
          ? { sent: true, to: res.to }
          : { sent: false, error: res.error };
      } else if (to === "sent") {
        mailResult = { sent: false };
      }

      return { to, emailFlag, mailResult };
    },
    onSuccess: ({ to, emailFlag, mailResult }) => {
      if (to === "sent") {
        if (emailFlag && mailResult?.sent) {
          toast.success(`Заявка отправлена · письмо на ${mailResult.to}`);
        } else if (emailFlag && mailResult && !mailResult.sent) {
          toast.warning(
            `Заявка отправлена, но письмо не ушло: ${mailResult.error || "ошибка SMTP"}`,
            { duration: 12_000 },
          );
        } else if (mailAvailable) {
          toast.success("Заявка отправлена без письма на почту");
        } else {
          toast.success("Заявка отправлена");
        }
      } else {
        toast.success(
          to === "done" ? "Заявка исполнена" : to === "rework" ? "Отправлена на доработку" : "Статус изменён",
        );
      }
      setBack(false);
      setReworkOpen(false);
      setSendOpen(false);
      setReason("");
      onChanged();
    },
    onError: showError,
  });

  const doneComment = (resultText ?? r.result_text ?? "").trim();

  const onNextClick = () => {
    if (!next) return;
    // «Отправить»: диалог с почтой — только если у вида включена отправка писем
    // (у Геотреста send_by_email=false → сразу статус, без почты).
    if (next.v === "sent") {
      if (typeMail?.enabled === false) {
        m.mutate({ to: "sent", emailFlag: false });
        return;
      }
      // сюда попадаем только если отправка писем у вида не выключена
      openSendDialog();
      return;
    }
    m.mutate({
      to: next.v,
      ...(next.v === "done" && doneComment ? { comment: doneComment } : {}),
    });
  };

  if (r.status === "done") {
    return (
      <div className={cn("flex flex-wrap items-center gap-3 text-sm", className)}>
        <span className="inline-flex items-center gap-1.5 font-medium text-success">
          <Check className="size-4" /> Исполнена
        </span>
      </div>
    );
  }

  if (!canNext && !canBack && !canRework) return null;

  const secondary = (
    <>
      {canRework && (
        <Button
          variant="outline"
          onClick={() => {
            setReason("");
            setReworkOpen(true);
          }}
          className="h-9 min-w-0 flex-1 gap-1.5 px-2.5 text-sm text-warning hover:text-warning sm:w-auto sm:flex-none sm:shrink-0"
        >
          <RotateCcw className="size-3.5 shrink-0" />
          <span className="truncate">{reworkDef?.next || "На доработку"}</span>
        </Button>
      )}
      {canBack && prev && (
        <Button
          variant="ghost"
          title={`Назад («${prev.label}»)`}
          onClick={() => {
            setReason("");
            setBack(true);
          }}
          className="h-9 min-w-0 flex-1 gap-1.5 px-2.5 text-sm text-muted-foreground sm:w-auto sm:flex-none sm:shrink-0"
        >
          <Undo2 className="size-3.5 shrink-0" />
          <span className="sm:hidden">Назад</span>
          <span className="hidden sm:inline">Назад («{prev.label}»)</span>
        </Button>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-2",
        className,
      )}
    >
      {(canRework || canBack) && (
        <div className="order-2 flex w-full gap-1.5 sm:order-1 sm:contents">{secondary}</div>
      )}
      {canNext && next && (
        <Button
          onClick={onNextClick}
          disabled={m.isPending || blockedByFields}
          title={blockedByFields ? `Сначала заполните: ${missingRequired.join(", ")}` : undefined}
          className="order-1 h-9 w-full bg-success px-3 text-sm text-success-foreground shadow-none hover:bg-success/90 sm:order-2 sm:w-auto sm:shrink-0"
        >
          {onRework ? "Готова к отправке" : next.next || next.label}
        </Button>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Отправить заявку</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <Switch
                checked={sendByEmail && mailAvailable}
                onCheckedChange={setSendByEmail}
                disabled={!mailAvailable}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Отправить на почту</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {mailAvailable
                    ? `${recipientEmail} · можно выключить`
                    : "Email не указан — заявка уйдёт без письма (поле «Адрес отправки» или email вида в справочнике)"}
                </span>
              </span>
            </label>
            {mailAvailable && sendByEmail ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Письмо — правьте прямо в превью</p>
                <EmailLetterPreview
                  to={recipientEmail}
                  title={mailTitle}
                  subtitle={mailSubtitle}
                  filename={attachmentPreview}
                  editable
                  onTitleChange={setMailTitle}
                  onSubtitleChange={setMailSubtitle}
                />
              </div>
            ) : null}
            <div className="flex gap-3">
              <Button
                type="button"
                disabled={m.isPending}
                onClick={() =>
                  m.mutate({
                    to: "sent",
                    emailFlag: mailAvailable && sendByEmail,
                    subject: mailTitle,
                    text: mailSubtitle,
                  })
                }
                className="h-9 flex-1 bg-success text-sm text-success-foreground hover:bg-success/90"
              >
                {m.isPending ? "Отправка…" : "Отправить"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSendOpen(false)}
                className="h-9 flex-1 text-sm"
              >
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={back} onOpenChange={setBack}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Вернуть на шаг «{prev?.label}»</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) {
                toast.error("Укажите причину");
                return;
              }
              if (prev) m.mutate({ to: prev.v, comment: reason.trim() });
            }}
          >
            <Textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина — обязательно"
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={m.isPending} className="h-9 flex-1 text-sm">
                Вернуть
              </Button>
              <Button type="button" variant="outline" onClick={() => setBack(false)} className="h-9 flex-1 text-sm">
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reworkOpen} onOpenChange={setReworkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Отправить на доработку</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) {
                toast.error("Укажите, что нужно доработать");
                return;
              }
              m.mutate({ to: "rework", comment: reason.trim() });
            }}
          >
            <p className="text-sm text-muted-foreground">
              Прораб увидит замечание, внесёт правки и снова отправит заявку.
            </p>
            <Textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Что исправить — обязательно"
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={m.isPending} className="h-9 flex-1 text-sm">
                На доработку
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReworkOpen(false)}
                className="h-9 flex-1 text-sm"
              >
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
