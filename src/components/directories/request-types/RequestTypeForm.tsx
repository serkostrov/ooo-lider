import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { looksLikeEmailField } from "@/lib/validation";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, emptyToNull } from "../common";
import { validateRequestType } from "../rules";
import { useBlankTemplates } from "../blank-templates/data";
import { REQUEST_TYPES_KEY, type RequestType } from "./data";
import {
  DEFAULT_EMAIL_SUBTITLE,
  DEFAULT_EMAIL_TITLE,
  EMAIL_PLACEHOLDER_GROUPS,
  EMAIL_PLACEHOLDER_SUGGESTIONS,
  previewAttachmentFileName,
  resolveEmailSubtitle,
  resolveEmailTitle,
  sampleEmailVars,
} from "@/lib/request-docs/emailCopy";
import { EmailLetterPreview } from "@/components/requests/EmailLetterPreview";
import { PlaceholderTextarea } from "@/components/directories/blank-constructor/PlaceholderTextarea";

const NONE = "__none";

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
  const { data: templates = [] } = useBlankTemplates();
  const activeTemplates = templates.filter(
    (t) =>
      (!t.is_draft && t.is_active) ||
      t.id === type?.blank_template_id,
  );

  const [name, setName] = useState(type?.name ?? "");
  const [email, setEmail] = useState(type?.send_to_email ?? "");
  const [sendByEmail, setSendByEmail] = useState(type?.send_by_email !== false);
  const [emailTitle, setEmailTitle] = useState(
    () => type?.email_title?.trim() || DEFAULT_EMAIL_TITLE,
  );
  const [emailSubtitle, setEmailSubtitle] = useState(
    () => type?.email_subtitle?.trim() || DEFAULT_EMAIL_SUBTITLE,
  );
  const [blankTemplateId, setBlankTemplateId] = useState(type?.blank_template_id ?? "");
  const [usesReps, setUsesReps] = useState(type?.uses_representatives ?? false);
  const [active, setActive] = useState(type?.is_active ?? true);

  const selectedTemplate = templates.find((t) => t.id === blankTemplateId) ?? null;
  const isGeotrest = selectedTemplate?.engine === "geotrest_message";
  const docTemplate = selectedTemplate?.engine ?? type?.doc_template ?? null;

  const emailPreview = useMemo(() => {
    const vars = sampleEmailVars(name);
    return {
      title: resolveEmailTitle(emailTitle || null, vars),
      subtitle: resolveEmailSubtitle(emailSubtitle || null, vars),
      filename: previewAttachmentFileName(docTemplate, vars.number, vars.call_date),
    };
  }, [name, emailTitle, emailSubtitle, docTemplate]);

  const m = useMutation({
    mutationFn: async () => {
      const err = validateRequestType({ name, send_to_email: email });
      if (err) throw new Error(err);
      const engine = selectedTemplate?.engine ?? null;
      const geotrest = engine === "geotrest_message";
      const payload = {
        name: name.trim(),
        send_to_email: geotrest ? null : emptyToNull(email),
        send_by_email: geotrest ? false : sendByEmail,
        email_title: geotrest ? null : emptyToNull(emailTitle),
        email_subtitle: geotrest ? null : emptyToNull(emailSubtitle),
        blank_template_id: emptyToNull(blankTemplateId),
        doc_template: engine,
        uses_representatives: usesReps,
        is_active: active,
      };
      let typeId = type?.id ?? null;
      if (type) {
        const { error } = await supabase
          .from("request_types")
          .update(payload as never)
          .eq("id", type.id);
        if (error) throw error;
      } else {
        const sort = allTypes.reduce((mx, t) => Math.max(mx, t.sort), 0) + 1;
        const { data, error } = await supabase
          .from("request_types")
          .insert({ ...payload, sort } as never)
          .select("id")
          .single();
        if (error) throw error;
        typeId = data.id as string;
      }

      // Почта вида → default_value у полей «Адрес отправки (email)» / похожих.
      if (typeId && !geotrest) {
        const { data: fields, error: fe } = await supabase
          .from("request_type_fields")
          .select("id, label, field_type")
          .eq("request_type_id", typeId)
          .is("deleted_at", null);
        if (fe) throw fe;
        const emailFieldIds = (fields ?? [])
          .filter((f) => looksLikeEmailField(f))
          .map((f) => f.id);
        if (emailFieldIds.length > 0) {
          const { error: de } = await supabase
            .from("request_type_fields")
            .update({ default_value: emptyToNull(email) } as never)
            .in("id", emailFieldIds);
          if (de) throw de;
        }
      }

      return typeId!;
    },
    onSuccess: async (id) => {
      toast.success("Сохранено");
      await qc.invalidateQueries({ queryKey: REQUEST_TYPES_KEY });
      await qc.invalidateQueries({ queryKey: ["dir-blank-templates"] });
      await qc.invalidateQueries({ queryKey: ["request-type-mail"] });
      await qc.invalidateQueries({ queryKey: ["dir-request-fields"] });
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
      <Field label="Шаблон бланка">
        <Select
          value={blankTemplateId || NONE}
          onValueChange={(v) => {
            const next = v === NONE ? "" : v;
            setBlankTemplateId(next);
            const tpl = templates.find((t) => t.id === next);
            if (tpl?.engine === "geotrest_message") {
              setSendByEmail(false);
              setEmail("");
              setEmailTitle("");
              setEmailSubtitle("");
            }
          }}
          disabled={readOnly}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Без бланка" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-sm">
              Без бланка
            </SelectItem>
            {activeTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-sm">
                {t.name}
                {!t.is_active ? " (неакт.)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Шаблоны настраиваются в справочнике{" "}
          <Link
            to="/directories"
            search={{ tab: "blank-templates" }}
            className="text-primary hover:underline"
          >
            Шаблоны бланков
          </Link>
          .
        </p>
      </Field>
      {isGeotrest ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Геотрест уходит сообщением в Max — отправка на почту для этого вида отключена.
        </p>
      ) : (
        <>
          <Field label="Адрес отправки (email)">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={readOnly}
              type="email"
              placeholder="Необязательно — можно указать в заявке"
              className="h-9 text-sm"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Подставится по умолчанию в поле «Адрес отправки» новых заявок. Если пусто — указывают в
              заявке вручную.
            </p>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <Switch
              checked={sendByEmail}
              onCheckedChange={setSendByEmail}
              disabled={readOnly}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Отправлять на почту</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                По умолчанию включено. Выключите, если заявки этого вида уходят без письма.
              </span>
            </span>
          </label>
          {sendByEmail ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Сопроводительное письмо</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Наберите {"{{"} — подсказка переменных; в превью подставятся демо-значения
                </p>
              </div>
              <Field label="Заголовок (тема)">
                <PlaceholderTextarea
                  value={emailTitle}
                  onChange={setEmailTitle}
                  disabled={readOnly}
                  rows={2}
                  suggestions={EMAIL_PLACEHOLDER_SUGGESTIONS}
                  groups={EMAIL_PLACEHOLDER_GROUPS}
                  className="min-h-[2.5rem]"
                  undoable
                />
              </Field>
              <Field label="Подзаголовок / текст">
                <PlaceholderTextarea
                  value={emailSubtitle}
                  onChange={setEmailSubtitle}
                  disabled={readOnly}
                  rows={7}
                  suggestions={EMAIL_PLACEHOLDER_SUGGESTIONS}
                  groups={EMAIL_PLACEHOLDER_GROUPS}
                  undoable
                />
              </Field>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-0 text-xs text-muted-foreground"
                  onClick={() => {
                    setEmailTitle(DEFAULT_EMAIL_TITLE);
                    setEmailSubtitle(DEFAULT_EMAIL_SUBTITLE);
                  }}
                >
                  Сбросить к стандартному тексту
                </Button>
              ) : null}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Предпросмотр</p>
                <EmailLetterPreview
                  to={email.trim() || "из заявки"}
                  title={emailPreview.title}
                  subtitle={emailPreview.subtitle}
                  filename={emailPreview.filename}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
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
