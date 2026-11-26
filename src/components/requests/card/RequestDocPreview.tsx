import { useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  Pencil,
  RotateCcw,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { isRequestOfficeRole } from "@/lib/permissions";
import {
  buildTechnadzorFillInput,
  DOCX_MIME,
  downloadArrayBuffer,
  fillTechnadzorWorkbook,
  technadzorFileName,
  technadzorPreviewRows,
  type TechnadzorFillInput,
  type TechnadzorObjectCtx,
} from "@/lib/request-docs/technadzor";
import {
  buildLabMosgazFillInput,
  fillLabMosgazDocx,
  formatLongRuDate,
  LAB_MOSGAZ_RECIPIENT_LINES,
  labMosgazFileName,
  labMosgazLetterBody,
  labMosgazRebuildLetter,
  type LabMosgazFillInput,
  type LabMosgazObjectCtx,
} from "@/lib/request-docs/labMosgaz";
import {
  buildLabIntegralFillInput,
  defaultLabIntegralTableRows,
  fillLabIntegralDocx,
  LAB_INTEGRAL_BUILDER,
  LAB_INTEGRAL_RECIPIENT,
  LAB_MOSGAZ_TABLE_RECIPIENT,
  labIntegralFileName,
  labMosgazTableFileName,
  type LabIntegralFillInput,
  type LabIntegralObjectCtx,
  type LabIntegralTableRow,
} from "@/lib/request-docs/labIntegral";
import {
  buildGeotrestFillInput,
  geotrestMessageBody,
  geotrestRebuildMessage,
  type GeotrestFillInput,
  type GeotrestObjectCtx,
} from "@/lib/request-docs/geotrest";
import {
  buildDocValueMap,
  geotrestInputFromMap,
  objectCtxToFlat,
  overlayIntegralOnMap,
  overlayTechnadzorOnMap,
  resolveExcelColumnValues,
  resolveTableRows,
} from "@/lib/request-docs/blankResolve";
import { parseBlankConfig } from "@/components/directories/blank-templates/data";
import { presetConfigForEngine } from "@/components/directories/blank-constructor/enginePresets";
import type { BlankConfig, BlankEngine } from "@/components/directories/blank-constructor/types";
import { formatDate } from "@/lib/format";
import {
  DEFAULT_PERFORMER,
  formatPerformerLine,
  LETTERHEAD_BG_URL,
  LETTERHEAD_SIGN_URL,
  LETTERHEAD_STAMP_URL,
  LIDER_COMPANY_NAME,
  LIDER_DIRECTOR,
  LIDER_REQUISITES,
} from "@/lib/request-docs/letterhead";
import { useRequestFields } from "@/components/directories/request-types/data";
import { downloadElementAsPdf } from "@/lib/request-docs/exportPreviewPdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FieldValue, RequestRow } from "../data";

type DocTemplate =
  | "technadzor_xlsx"
  | "lab_mosgaz_docx"
  | "lab_mosgaz_table_docx"
  | "lab_integral_docx"
  | "geotrest_message"
  | string
  | null;
type PreviewKind =
  | "technadzor_xlsx"
  | "lab_mosgaz_docx"
  | "lab_mosgaz_table_docx"
  | "lab_integral_docx"
  | "geotrest_message";

export type RequestDocDraft = {
  template: PreviewKind;
  mosgaz?: LabMosgazFillInput;
  integral?: LabIntegralFillInput;
  technadzor?: TechnadzorFillInput;
  geotrest?: GeotrestFillInput;
};

type BuiltPreview =
  | { kind: "technadzor_xlsx"; input: TechnadzorFillInput; excelValues?: (string | number | null)[] }
  | { kind: "lab_mosgaz_docx"; input: LabMosgazFillInput }
  | {
      kind: "lab_mosgaz_table_docx";
      input: LabIntegralFillInput;
      tableRows: LabIntegralTableRow[];
    }
  | {
      kind: "lab_integral_docx";
      input: LabIntegralFillInput;
      tableRows: LabIntegralTableRow[];
    }
  | { kind: "geotrest_message"; input: GeotrestFillInput };

function useDocObjectCtx(objectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["request-doc-object", objectId],
    enabled,
    queryFn: async () => {
      const { data: obj, error } = await supabase
        .from("objects")
        .select(
          "name, address, project_number, utn_number, utn_date, customer_id, technadzor_contact_id",
        )
        .eq("id", objectId)
        .maybeSingle();
      if (error) throw error;
      if (!obj) throw new Error("Объект не найден");

      let customer = "";
      if (obj.customer_id) {
        const { data: c } = await supabase.from("customers").select("name").eq("id", obj.customer_id).maybeSingle();
        customer = c?.name ?? "";
      }

      let inspector = "";
      if (obj.technadzor_contact_id) {
        const { data: tn } = await supabase
          .from("customer_contacts")
          .select("full_name, phone")
          .eq("id", obj.technadzor_contact_id)
          .maybeSingle();
        inspector = [tn?.full_name, tn?.phone].filter(Boolean).join(" ");
      }

      const technadzor: TechnadzorObjectCtx = {
        address: obj.address ?? "",
        projectNumber: obj.project_number ?? "",
        utnNumber: obj.utn_number ?? "",
        utnDate: obj.utn_date ?? null,
        customer,
        inspector,
      };
      const lab: LabMosgazObjectCtx = {
        name: obj.name ?? "",
        address: obj.address ?? "",
        projectNumber: obj.project_number ?? "",
      };
      const integral: LabIntegralObjectCtx = {
        name: obj.name ?? "",
        address: obj.address ?? "",
        utnNumber: obj.utn_number ?? "",
        utnDate: obj.utn_date ?? null,
      };
      const geotrest: GeotrestObjectCtx = {
        name: obj.name ?? "",
        address: obj.address ?? "",
        projectNumber: obj.project_number ?? "",
      };
      return { technadzor, lab, integral, geotrest };
    },
  });
}

/**
 * Превью бланка. Данные заявки прораба не меняются —
 * офис правит текст исходящего документа здесь (черновик doc_draft).
 */
export function RequestDocPreviewButton({
  r,
  values,
  className,
}: {
  r: RequestRow;
  values: FieldValue[];
  className?: string;
}) {
  const me = useProfile();
  const qc = useQueryClient();
  const { data: fields = [] } = useRequestFields(r.request_type_id);
  const { data: typeMeta } = useQuery({
    queryKey: ["request-type-doc", r.request_type_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_types")
        .select("doc_template, blank_template_id")
        .eq("id", r.request_type_id)
        .maybeSingle();
      if (error) throw error;
      const docTemplate = (data?.doc_template ?? null) as DocTemplate;
      let blankConfig: BlankConfig | null = null;
      const engine =
        docTemplate === "technadzor_xlsx" ||
        docTemplate === "lab_mosgaz_docx" ||
        docTemplate === "lab_mosgaz_table_docx" ||
        docTemplate === "lab_integral_docx" ||
        docTemplate === "geotrest_message"
          ? (docTemplate as BlankEngine)
          : null;
      if (data?.blank_template_id) {
        const { data: tpl, error: tplErr } = await supabase
          .from("request_blank_templates")
          .select("config, format, engine")
          .eq("id", data.blank_template_id)
          .maybeSingle();
        if (tplErr) throw tplErr;
        if (tpl) {
          blankConfig = parseBlankConfig(
            tpl.config,
            (tpl.format as BlankConfig["format"]) ?? null,
            (tpl.engine as BlankEngine | null) ?? engine,
          );
        }
      }
      if (!blankConfig && engine) blankConfig = presetConfigForEngine(engine);
      return { docTemplate, blankConfig };
    },
  });

  const kind: PreviewKind | null =
    typeMeta?.docTemplate === "technadzor_xlsx" ||
    typeMeta?.docTemplate === "lab_mosgaz_docx" ||
    typeMeta?.docTemplate === "lab_mosgaz_table_docx" ||
    typeMeta?.docTemplate === "lab_integral_docx" ||
    typeMeta?.docTemplate === "geotrest_message"
      ? typeMeta.docTemplate
      : null;
  const blankConfig = typeMeta?.blankConfig ?? null;

  const { data: objectCtx, isLoading: objLoading } = useDocObjectCtx(r.object_id, !!kind);
  const { data: savedDraft } = useQuery({
    queryKey: ["request", r.id, "doc_draft"],
    enabled: !!kind,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("doc_draft" as never)
        .eq("id", r.id)
        .maybeSingle();
      if (error) throw error;
      const row = data as { doc_draft?: RequestDocDraft | null } | null;
      return row?.doc_draft ?? null;
    },
  });

  const canEditDoc = isRequestOfficeRole(me) && r.status !== "done";

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [built, setBuilt] = useState<BuiltPreview | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sheetEditing, setSheetEditing] = useState(false);
  /** После «Из заявки» сохранение сбрасывает черновик (снимает метку «изменён»). */
  const [resetToForm, setResetToForm] = useState(false);

  const title =
    kind === "lab_mosgaz_docx"
      ? "Факсограмма Лаб. МГ / УЭГНД"
      : kind === "lab_mosgaz_table_docx"
        ? "Заявка в лабораторию Мосгаза"
        : kind === "lab_integral_docx"
          ? "Заявка в лабораторию «Интеграл»"
          : kind === "geotrest_message"
            ? "Сообщение для Геотрест (Max)"
            : "Бланк технадзора";
  const Icon =
    kind === "technadzor_xlsx"
      ? FileSpreadsheet
      : kind === "geotrest_message"
        ? MessageSquare
        : FileText;

  const buildValueMap = () => {
    if (!objectCtx) throw new Error("Данные объекта ещё загружаются — подождите секунду");
    return buildDocValueMap({
      requestNumber: r.number,
      callDate: r.call_date,
      values,
      fields,
      object: objectCtxToFlat(objectCtx),
    });
  };

  const integralTableRows = (input: LabIntegralFillInput, map: ReturnType<typeof buildDocValueMap>) => {
    if (blankConfig && blankConfig.tableRows.length > 0) {
      return resolveTableRows(blankConfig, overlayIntegralOnMap(map, input));
    }
    return defaultLabIntegralTableRows(input);
  };

  const buildFromRequest = (): BuiltPreview => {
    if (!kind) throw new Error("У вида заявки нет бланка");
    if (!objectCtx) throw new Error("Данные объекта ещё загружаются — подождите секунду");
    const map = buildValueMap();
    if (kind === "technadzor_xlsx") {
      const input = buildTechnadzorFillInput({
        callDate: r.call_date,
        values,
        fields,
        objectCtx: objectCtx.technadzor,
      });
      const excelValues =
        blankConfig && blankConfig.excelColumns.length > 0
          ? resolveExcelColumnValues(
              blankConfig.excelColumns,
              overlayTechnadzorOnMap(map, input),
            )
          : undefined;
      return { kind, input, ...(excelValues ? { excelValues } : {}) };
    }
    if (kind === "lab_mosgaz_table_docx") {
      const input = buildLabIntegralFillInput({
        requestNumber: r.number,
        callDate: r.call_date,
        values,
        fields,
        objectCtx: objectCtx.integral,
        recipient:
          blankConfig?.recipientLines[0]?.trim() || LAB_MOSGAZ_TABLE_RECIPIENT,
      });
      return { kind, input, tableRows: integralTableRows(input, map) };
    }
    if (kind === "geotrest_message") {
      if (blankConfig?.messageTemplate.trim()) {
        return {
          kind,
          input: geotrestInputFromMap(map, blankConfig.messageTemplate),
        };
      }
      return {
        kind,
        input: buildGeotrestFillInput({
          callDate: r.call_date,
          values,
          fields,
          objectCtx: objectCtx.geotrest,
        }),
      };
    }
    if (kind === "lab_mosgaz_docx") {
      const input = buildLabMosgazFillInput({
        requestNumber: r.number,
        callDate: r.call_date,
        values,
        fields,
        objectCtx: objectCtx.lab,
      });
      return { kind, input: { ...input, letterOverride: labMosgazLetterBody(input) } };
    }
    const input = buildLabIntegralFillInput({
      requestNumber: r.number,
      callDate: r.call_date,
      values,
      fields,
      objectCtx: objectCtx.integral,
      recipient: blankConfig?.recipientLines[0]?.trim() || LAB_INTEGRAL_RECIPIENT,
    });
    return { kind, input, tableRows: integralTableRows(input, map) };
  };

  const applyDraft = (base: BuiltPreview, draft: RequestDocDraft | null): BuiltPreview => {
    if (!draft || draft.template !== base.kind) return base;
    if (base.kind === "lab_mosgaz_docx" && draft.mosgaz) {
      return {
        kind: base.kind,
        input: {
          ...base.input,
          ...draft.mosgaz,
          performer: draft.mosgaz.performer?.trim() || base.input.performer || DEFAULT_PERFORMER,
        },
      };
    }
    if (
      (base.kind === "lab_integral_docx" || base.kind === "lab_mosgaz_table_docx") &&
      draft.integral
    ) {
      const input = {
        ...base.input,
        ...draft.integral,
        recipient:
          draft.integral.recipient?.trim() ||
          base.input.recipient ||
          (base.kind === "lab_mosgaz_table_docx" ? LAB_MOSGAZ_TABLE_RECIPIENT : LAB_INTEGRAL_RECIPIENT),
        projectReg: draft.integral.projectReg ?? base.input.projectReg ?? "",
        performer: draft.integral.performer?.trim() || base.input.performer || DEFAULT_PERFORMER,
      };
      let map: ReturnType<typeof buildDocValueMap>;
      try {
        map = buildValueMap();
      } catch {
        return { kind: base.kind, input, tableRows: base.tableRows };
      }
      return { kind: base.kind, input, tableRows: integralTableRows(input, map) };
    }
    if (base.kind === "geotrest_message" && draft.geotrest) {
      return { kind: base.kind, input: { ...base.input, ...draft.geotrest } };
    }
    if (base.kind === "technadzor_xlsx" && draft.technadzor) {
      const input = { ...base.input, ...draft.technadzor };
      let excelValues = base.excelValues;
      if (blankConfig && blankConfig.excelColumns.length > 0) {
        try {
          excelValues = resolveExcelColumnValues(
            blankConfig.excelColumns,
            overlayTechnadzorOnMap(buildValueMap(), input),
          );
        } catch {
          /* keep */
        }
      }
      return { kind: base.kind, input, ...(excelValues ? { excelValues } : {}) };
    }
    return base;
  };

  /** Бланк показываем только когда его уже можно собрать (или есть сохранённый черновик). */
  const canShowPreview = useMemo(() => {
    if (!kind || !objectCtx) return false;
    if (savedDraft && savedDraft.template === kind) return true;
    try {
      buildFromRequest();
      return true;
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пересчёт от данных заявки
  }, [kind, objectCtx, values, fields, savedDraft, r.call_date, r.number]);

  const openPreview = () => {
    setBuilt(null);
    setDirty(false);
    setSheetEditing(false);
    setResetToForm(false);
    try {
      const base = buildFromRequest();
      setBuilt(applyDraft(base, savedDraft ?? null));
      setOpen(true);
    } catch {
      // Не открываем пустое окно с ошибкой — кнопки нет, если бланк не готов.
    }
  };

  if (!kind || (!objLoading && !canShowPreview)) return null;

  const patchBuilt = (next: BuiltPreview) => {
    setBuilt(next);
    setDirty(true);
    setResetToForm(false);
  };

  const onSaveDraft = async () => {
    if (!built) return;
    setSaving(true);
    try {
      let draft: RequestDocDraft | null = null;
      if (!resetToForm) {
        if (built.kind === "lab_mosgaz_docx") {
          draft = { template: built.kind, mosgaz: built.input };
        } else if (built.kind === "lab_integral_docx" || built.kind === "lab_mosgaz_table_docx") {
          draft = { template: built.kind, integral: built.input };
        } else if (built.kind === "geotrest_message") {
          draft = { template: built.kind, geotrest: built.input };
        } else {
          draft = { template: built.kind, technadzor: built.input };
        }
      }
      const { error } = await supabase.rpc(
        "request_save_doc_draft" as never,
        { p_request_id: r.id, p_draft: draft } as never,
      );
      if (error) throw error;
      setDirty(false);
      setResetToForm(false);
      toast.success(draft ? "Черновик бланка сохранён — заявка помечена как изменённая" : "Бланк снова из полей заявки");
      void qc.invalidateQueries({ queryKey: ["request", r.id, "doc_draft"] });
      void qc.invalidateQueries({ queryKey: ["request", r.id] });
      void qc.invalidateQueries({ queryKey: ["requests"] });
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  };

  const onResetToRequest = () => {
    try {
      const base = buildFromRequest();
      setBuilt(base);
      setDirty(true);
      setResetToForm(true);
      toast.message("Вернули текст из заявки — сохраните бланк, чтобы снять метку «изменён»");
    } catch (e) {
      showError(e);
    }
  };

  const draftEdited = !!savedDraft || r.doc_draft_edited;

  const currentFileBase = () => {
    if (!built) return `zayavka-${r.number}`;
    if (built.kind === "technadzor_xlsx") return technadzorFileName(r.number, r.call_date);
    if (built.kind === "lab_mosgaz_docx") return labMosgazFileName(r.number, r.call_date);
    if (built.kind === "lab_mosgaz_table_docx") return labMosgazTableFileName(r.number, r.call_date);
    if (built.kind === "lab_integral_docx") return labIntegralFileName(r.number, r.call_date);
    return `zayavka-${r.number}`;
  };

  const onDownloadNative = async () => {
    if (!built) return;
    setBusy(true);
    try {
      if (built.kind === "geotrest_message") {
        const text = geotrestMessageBody(built.input);
        await navigator.clipboard.writeText(text);
        toast.success("Сообщение скопировано — вставьте в Max");
        return;
      }
      if (built.kind === "technadzor_xlsx") {
        const buf = await fillTechnadzorWorkbook(built.input, built.excelValues);
        downloadArrayBuffer(buf, technadzorFileName(r.number, r.call_date));
        toast.success("Excel скачан");
      } else if (built.kind === "lab_mosgaz_docx") {
        const buf = await fillLabMosgazDocx(built.input);
        downloadArrayBuffer(buf, labMosgazFileName(r.number, r.call_date), DOCX_MIME);
        toast.success("Word скачан");
      } else if (built.kind === "lab_mosgaz_table_docx") {
        const buf = await fillLabIntegralDocx(built.input, built.tableRows);
        downloadArrayBuffer(buf, labMosgazTableFileName(r.number, r.call_date), DOCX_MIME);
        toast.success("Word скачан");
      } else {
        const buf = await fillLabIntegralDocx(built.input, built.tableRows);
        downloadArrayBuffer(buf, labIntegralFileName(r.number, r.call_date), DOCX_MIME);
        toast.success("Word скачан");
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const onDownloadPdf = async () => {
    const wasEditing = sheetEditing;
    // PDF снимает DOM как есть — на время экспорта закрываем правку (без рамок инпутов).
    if (wasEditing) flushSync(() => setSheetEditing(false));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const root = previewRef.current;
    const el =
      (root?.querySelector("[data-blank-sheet]") as HTMLElement | null) ?? root;
    if (!el) {
      if (wasEditing) setSheetEditing(true);
      toast.error("Превью ещё не готово");
      return;
    }
    setBusy(true);
    try {
      await downloadElementAsPdf(el, currentFileBase());
      toast.success("PDF скачан");
    } catch (e) {
      showError(e);
    } finally {
      if (wasEditing) setSheetEditing(true);
      setBusy(false);
    }
  };

  const isMessage = built?.kind === "geotrest_message";
  const isExcel = built?.kind === "technadzor_xlsx";
  const nativeDownloadLabel = isExcel ? "Excel (.xlsx)" : "Word (.docx)";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={openPreview}
        disabled={objLoading && !objectCtx}
        className={className ?? "h-8 shrink-0 gap-1.5 px-2.5 text-xs"}
      >
        <FileText className="size-3.5" />
        Просмотреть бланк
        {draftEdited ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            изменён
          </span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "flex h-[min(92vh,900px)] max-w-none flex-col gap-0 overflow-hidden p-0",
            kind === "technadzor_xlsx"
              ? "w-[min(98vw,1280px)]"
              : "w-[min(96vw,820px)]",
          )}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-3 text-left">
            <div className="flex items-start justify-between gap-3 pr-8">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </DialogTitle>
              {isMessage ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!built || busy}
                  onClick={() => void onDownloadNative()}
                  className="h-8 shrink-0 gap-1.5"
                >
                  <Copy className="size-3.5" />
                  {busy ? "Копируем…" : "Скопировать сообщение"}
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!built || busy}
                      className="h-8 shrink-0 gap-1.5"
                    >
                      <Download className="size-3.5" />
                      {busy ? "Формируем…" : "Скачать"}
                      <ChevronDown className="size-3.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[11rem]">
                    <DropdownMenuItem
                      disabled={busy}
                      onClick={() => void onDownloadNative()}
                      className="gap-2"
                    >
                      {isExcel ? (
                        <FileSpreadsheet className="size-3.5" />
                      ) : (
                        <FileText className="size-3.5" />
                      )}
                      {nativeDownloadLabel}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={busy}
                      onClick={() => void onDownloadPdf()}
                      className="gap-2"
                    >
                      <Download className="size-3.5" />
                      PDF (.pdf)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              {kind === "geotrest_message"
                ? "Скопируйте текст и отправьте в Max на номер Геотреста."
                : kind === "technadzor_xlsx"
                  ? canEditDoc
                    ? "Excel-бланк: горизонтальная таблица, скачивается .xlsx."
                    : "Превью Excel; файл — «Скачать Excel»."
                  : canEditDoc
                    ? sheetEditing
                      ? "Правьте прямо на бланке — данные заявки прораба не изменятся. Потом «Сохранить бланк»."
                      : "Нажмите «Изменить», чтобы править поля прямо на бланке."
                    : "Так документ уйдёт заказчику."}
            </DialogDescription>
          </DialogHeader>

          <div
            ref={previewRef}
            className="min-h-0 flex-1 overflow-y-auto bg-neutral-200/70 px-3 py-3 sm:px-5 sm:py-4"
          >
            {built?.kind === "lab_mosgaz_docx" ? (
              <LabMosgazEditor
                input={built.input}
                editing={canEditDoc && sheetEditing}
                onChange={(input) => patchBuilt({ kind: "lab_mosgaz_docx", input })}
              />
            ) : built?.kind === "lab_integral_docx" || built?.kind === "lab_mosgaz_table_docx" ? (
              <LabIntegralEditor
                input={built.input}
                tableRows={built.tableRows}
                editing={canEditDoc && sheetEditing}
                onChange={(input) => {
                  let tableRows = built.tableRows;
                  try {
                    tableRows = integralTableRows(input, buildValueMap());
                  } catch {
                    /* keep */
                  }
                  patchBuilt({ kind: built.kind, input, tableRows });
                }}
              />
            ) : built?.kind === "geotrest_message" ? (
              <GeotrestEditor
                input={built.input}
                editing={canEditDoc && sheetEditing}
                onChange={(input) => patchBuilt({ kind: "geotrest_message", input })}
              />
            ) : built ? (
              <RowsEditor
                title="Заявка на вызов технадзора"
                rows={technadzorPreviewRows(built.input)}
                editing={canEditDoc && sheetEditing}
                keys={[
                  null,
                  "inspector",
                  "customer",
                  null,
                  "responsibleWorks",
                  "address",
                  "workTypes",
                  "projectNumber",
                  "utnNumber",
                  null,
                  "note",
                ]}
                onChange={(key, value) => {
                  const input = { ...built.input, [key]: value } as TechnadzorFillInput;
                  let excelValues = built.excelValues;
                  if (blankConfig && blankConfig.excelColumns.length > 0) {
                    try {
                      excelValues = resolveExcelColumnValues(
                        blankConfig.excelColumns,
                        overlayTechnadzorOnMap(buildValueMap(), input),
                      );
                    } catch {
                      /* keep */
                    }
                  }
                  patchBuilt({
                    kind: "technadzor_xlsx",
                    input,
                    ...(excelValues ? { excelValues } : {}),
                  });
                }}
              />
            ) : null}
          </div>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {dirty
                ? "Есть несохранённые правки бланка."
                : kind === "geotrest_message"
                  ? "Скопируйте текст и вставьте в Max."
                  : "Файл совпадает с тем, что на экране."}
            </p>
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
              {canEditDoc && (
                <>
                  <Button
                    type="button"
                    variant={sheetEditing ? "secondary" : "outline"}
                    onClick={() => setSheetEditing((v) => !v)}
                    disabled={!built}
                    className="h-9 gap-1.5"
                  >
                    <Pencil className="size-4" />
                    {sheetEditing ? "Готово" : "Изменить"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onResetToRequest}
                    disabled={!built}
                    className="h-9 gap-1.5"
                  >
                    <RotateCcw className="size-4" />
                    Из заявки
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onSaveDraft}
                    disabled={!built || saving || !dirty}
                    className="h-9 gap-1.5"
                  >
                    <Save className="size-4" />
                    {saving ? "Сохранение…" : "Сохранить бланк"}
                  </Button>
                </>
              )}
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-9">
                Закрыть
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Белый лист: тёмный текст принудительно (тёмная тема CRM иначе делает текст невидимым). */
function LetterheadShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-blank-sheet
      className={cn(
        "mx-auto flex w-full max-w-[720px] flex-col overflow-visible rounded-lg border border-neutral-300 bg-white text-neutral-900 shadow-sm",
        className,
      )}
    >
      {/* Только верх бланка — нижняя полоска не рисуется поверх текста */}
      <div
        className="overflow-hidden rounded-t-lg px-5 pb-2 text-center"
        style={{
          backgroundColor: "#fff",
          backgroundImage: `url(${LETTERHEAD_BG_URL})`,
          backgroundSize: "100% auto",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "top center",
          paddingTop: "18%",
        }}
      >
        <p className="text-[12px] font-semibold leading-snug text-neutral-900">{LIDER_COMPANY_NAME}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-700">{LIDER_REQUISITES}</p>
      </div>
      <div className="flex-1 border-t border-neutral-200/80 pt-4 text-neutral-900">{children}</div>
      <div
        data-letterhead-footer
        className="mt-5 h-3.5 w-full shrink-0 bg-no-repeat"
        style={{
          backgroundImage: `url(${LETTERHEAD_BG_URL})`,
          backgroundSize: "100% auto",
          backgroundPosition: "bottom center",
        }}
        aria-hidden
      />
    </div>
  );
}

/** Печать + подпись + директор + исполнитель (как в образцах). */
function DirectorFooter({
  editing,
  performer,
  onPerformerChange,
}: {
  editing: boolean;
  performer: string;
  onPerformerChange?: (v: string) => void;
}) {
  return (
    <div className="mt-4 space-y-4 overflow-visible">
      <div className="relative min-h-[6.5rem] overflow-visible pt-1 text-[13px] leading-snug text-neutral-900">
        <div className="absolute left-0 top-2 z-20 w-[5.75rem] space-y-5 text-right font-semibold">
          <p>Директор</p>
          <p>М.П.</p>
        </div>
        <img
          src={LETTERHEAD_STAMP_URL}
          alt="Печать"
          className="pointer-events-none absolute left-[1.75rem] top-3 z-10 h-[120px] w-[128px] object-contain"
        />
        <div className="absolute bottom-1 left-[7.5rem] right-[10.5rem]">
          <div className="relative flex h-9 items-end justify-center border-b border-neutral-900">
            <img
              src={LETTERHEAD_SIGN_URL}
              alt="Подпись"
              className="pointer-events-none absolute bottom-0.5 left-[8%] z-20 h-[78px] w-[128px] object-contain"
            />
          </div>
        </div>
        <p className="absolute bottom-1 right-0 z-20 font-semibold">
          / {LIDER_DIRECTOR}/
        </p>
      </div>
      <div
        data-performer-line
        className="border-t border-neutral-200 pt-2.5 text-[12px] leading-snug text-neutral-700"
      >
        {editing && onPerformerChange ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0">Исполнитель:</span>
            <InlineValue
              value={performer.replace(/^исполнитель:\s*/i, "")}
              editing
              onChange={onPerformerChange}
              inputClassName="max-w-md flex-1"
            />
          </div>
        ) : (
          <p>{formatPerformerLine(performer || DEFAULT_PERFORMER)}</p>
        )}
      </div>
    </div>
  );
}

const inlineControl =
  "border-sky-300/90 bg-sky-50 text-neutral-900 shadow-none focus-visible:ring-sky-400";

function InlineValue({
  value,
  editing,
  onChange,
  multiline,
  type,
  className,
  inputClassName,
  placeholder,
}: {
  value: string;
  editing: boolean;
  onChange?: ((v: string) => void) | undefined;
  multiline?: boolean | undefined;
  type?: string | undefined;
  className?: string | undefined;
  inputClassName?: string | undefined;
  placeholder?: string | undefined;
}) {
  if (!editing || !onChange) {
    return (
      <span className={cn("whitespace-pre-line text-neutral-900", className)}>
        {value.trim() ? value : "—"}
      </span>
    );
  }
  if (multiline) {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className={cn("min-h-[3.25rem] w-full text-sm", inlineControl, inputClassName)}
      />
    );
  }
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("h-8 w-full text-sm", inlineControl, inputClassName)}
    />
  );
}

function excelColLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Технадзор — горизонтальная таблица как в Excel / конструкторе шаблонов. */
function RowsEditor({
  title,
  rows,
  editing,
  keys,
  onChange,
}: {
  title: string;
  rows: { label: string; value: string }[];
  editing: boolean;
  keys: (string | null)[];
  onChange: (key: string, value: string) => void;
}) {
  const colCount = Math.max(rows.length, 1);

  return (
    <div
      data-blank-sheet
      className="overflow-hidden rounded-lg border border-[#c5c5c5] bg-[#f3f3f3] shadow-md"
    >
      <div className="flex items-center gap-2 border-b border-[#217346] bg-[#217346] px-3 py-2">
        <FileSpreadsheet className="size-4 shrink-0 text-white" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-white">{title}.xlsx</p>
          <p className="text-[10px] text-white/75">Microsoft Excel</p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[#d0d0d0] bg-[#f3f3f3] px-2 py-1.5">
        <span className="w-10 shrink-0 rounded border border-[#c8c8c8] bg-white px-1.5 py-0.5 text-center text-[11px] font-semibold text-[#333]">
          A1
        </span>
        <span className="text-[12px] text-[#666]">fx</span>
        <div className="min-h-[22px] min-w-0 flex-1 truncate rounded border border-[#c8c8c8] bg-white px-2 py-0.5 text-[12px] text-[#222]">
          {rows[0]?.label || "—"}
        </div>
      </div>

      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-10 border border-[#d4d4d4] bg-[#f3f3f3] px-1 py-1 text-center text-[10px] font-medium text-[#666]" />
              {rows.map((_, i) => (
                <th
                  key={i}
                  className="min-w-[7.5rem] border border-[#d4d4d4] bg-[#f3f3f3] px-2 py-1 text-center text-[11px] font-semibold text-[#444]"
                >
                  {excelColLetter(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-[#d4d4d4] bg-[#f3f3f3] px-1 py-1.5 text-center text-[11px] font-medium text-[#666]">
                1
              </td>
              {rows.map((row) => (
                <td
                  key={row.label}
                  className="border border-[#d4d4d4] bg-[#e2efda] px-2 py-1.5 text-[11px] font-semibold leading-snug text-[#1f1f1f]"
                >
                  {row.label}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-[#d4d4d4] bg-[#f3f3f3] px-1 py-1.5 text-center text-[11px] font-medium text-[#666]">
                2
              </td>
              {rows.map((row, i) => {
                const key = keys[i] ?? null;
                const canEdit = editing && !!key;
                return (
                  <td
                    key={row.label}
                    className="border border-[#d4d4d4] bg-white px-1.5 py-1 align-top text-[12px] text-[#222]"
                  >
                    <InlineValue
                      value={row.value}
                      editing={canEdit}
                      onChange={canEdit ? (v) => onChange(key!, v) : undefined}
                      multiline={
                        canEdit &&
                        (row.value.length > 40 || /виды|примечание/i.test(row.label))
                      }
                      className="text-[12px]"
                      inputClassName="min-h-[2rem] text-[12px]"
                    />
                  </td>
                );
              })}
            </tr>
            {[3, 4].map((rowNo) => (
              <tr key={rowNo}>
                <td className="border border-[#d4d4d4] bg-[#f3f3f3] px-1 py-1.5 text-center text-[11px] font-medium text-[#666]">
                  {rowNo}
                </td>
                {Array.from({ length: colCount }, (_, i) => (
                  <td key={i} className="h-[28px] border border-[#d4d4d4] bg-white" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-end gap-0 border-t border-[#d0d0d0] bg-[#f3f3f3] px-2 pt-1">
        <div className="rounded-t border border-b-0 border-[#d0d0d0] bg-white px-3 py-1 text-[11px] font-medium text-[#217346]">
          Заявка
        </div>
        <p className="ml-auto self-center pb-1 text-[10px] text-[#777]">
          Строка заголовков + данные · листайте вправо
        </p>
      </div>
    </div>
  );
}

const INTEGRAL_ROW_KEYS: (keyof LabIntegralFillInput | null)[] = [
  null,
  "method",
  "callTime",
  "norms",
  "conditions",
  "objectName",
  "projectReg",
  "address",
  "specimens",
  "responsible",
];

function LabIntegralEditor({
  input,
  tableRows,
  editing,
  onChange,
}: {
  input: LabIntegralFillInput;
  tableRows: LabIntegralTableRow[];
  editing: boolean;
  onChange: (input: LabIntegralFillInput) => void;
}) {
  const set = <K extends keyof LabIntegralFillInput>(key: K, value: LabIntegralFillInput[K]) => {
    onChange({ ...input, [key]: value });
  };
  const sourceRows = tableRows.length > 0 ? tableRows : defaultLabIntegralTableRows(input);
  const rows: {
    label: string;
    value: string;
    key: keyof LabIntegralFillInput | null;
    multiline?: boolean;
  }[] = [
    ...sourceRows.map((r, i) => {
      const key = INTEGRAL_ROW_KEYS[i] ?? null;
      const value =
        key === "callTime"
          ? `${formatDate(input.callDate)} ${input.callTime}`
          : key
            ? String(input[key] ?? r.value)
            : r.value;
      return {
        label: `${r.number}. ${r.label}`,
        value,
        key: key === "callTime" && editing ? "callTime" : key,
        multiline: key === "norms" || key === "conditions" || key === "specimens",
      };
    }),
    { label: "Примечание", value: input.note, key: "note", multiline: true },
  ];

  return (
    <LetterheadShell>
      {/* Как в образце АНПИ Интеграл.docx: ~14pt, плотные ячейки без «воздуха» */}
      <div className="space-y-2.5 px-5 py-4 font-serif text-[14px] leading-snug text-neutral-900">
        <div className="grid gap-1.5 sm:grid-cols-2 sm:items-start">
          <div className="font-semibold text-neutral-900">
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Исх. №</span>
                <InlineValue
                  value={input.outNumber}
                  editing
                  onChange={(v) => set("outNumber", v)}
                  inputClassName="w-24"
                  placeholder="№"
                />
                <span>от</span>
                <InlineValue
                  value={input.letterDate}
                  editing
                  type="date"
                  onChange={(v) => set("letterDate", v)}
                  inputClassName="w-40"
                />
              </div>
            ) : (
              <p>{`Исх. № ${input.outNumber.trim() || "…"} от ${formatLongRuDate(input.letterDate)}`}</p>
            )}
          </div>
          <p className="text-right font-semibold text-neutral-900">
            {input.recipient || LAB_INTEGRAL_RECIPIENT}
          </p>
        </div>
        <div className="h-2.5" />
        <table className="w-full border-collapse border border-neutral-800 text-center text-[13px] leading-snug text-neutral-900">
          <tbody>
            {rows.map((row) => {
              if (row.label === "Примечание" && !editing && !row.value.trim()) return null;
              const fieldEditing = editing && !!row.key;
              const m = /^(\d+)\.\s*(.+)$/.exec(row.label);
              const num = m?.[1] ?? "";
              const label = m?.[2] ?? row.label;
              return (
                <tr key={row.label} className="align-middle">
                  <td className="w-8 border border-neutral-800 px-1 py-1 font-semibold">{num}</td>
                  <td className="w-[38%] border border-neutral-800 px-2 py-1 text-left font-semibold leading-snug sm:text-center">
                    {label}
                  </td>
                  <td className="border border-neutral-800 px-2 py-1 text-left leading-snug sm:text-center">
                    {row.key === "callTime" && editing ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span>{formatDate(input.callDate)}</span>
                        <InlineValue
                          value={input.callTime}
                          editing
                          onChange={(v) => set("callTime", v)}
                          inputClassName="w-24"
                        />
                      </div>
                    ) : (
                      <InlineValue
                        value={row.value}
                        editing={fieldEditing}
                        onChange={
                          fieldEditing && row.key
                            ? (v) => set(row.key as keyof LabIntegralFillInput, v)
                            : undefined
                        }
                        multiline={row.multiline}
                        className="text-[13px] leading-snug"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <DirectorFooter
          editing={editing}
          performer={input.performer || DEFAULT_PERFORMER}
          onPerformerChange={(v) => set("performer", v)}
        />
      </div>
    </LetterheadShell>
  );
}

function GeotrestEditor({
  input,
  editing,
  onChange,
}: {
  input: GeotrestFillInput;
  editing: boolean;
  onChange: (input: GeotrestFillInput) => void;
}) {
  const text = useMemo(() => geotrestMessageBody(input), [input]);
  const set = <K extends keyof GeotrestFillInput>(key: K, value: GeotrestFillInput[K]) => {
    const next = { ...input, [key]: value };
    if (key !== "messageOverride") {
      onChange(geotrestRebuildMessage(next));
      return;
    }
    onChange(next);
  };

  return (
    <div
      data-blank-sheet
      className="mx-auto max-w-[720px] space-y-4 rounded-lg border border-neutral-300 bg-white p-5 text-neutral-900 shadow-sm"
    >
      <p className="text-sm font-semibold text-neutral-800">Текст для Max</p>
      {editing ? (
        <div className="space-y-3">
          {(
            [
              ["callLine", "1. Дата вызова"],
              ["objectLine", "2. Объект"],
              ["volume", "3. Коммуникация и объём"],
              ["address", "4. Адрес"],
              ["responsible", "5. Ответственный"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1 text-sm">
              <span className="font-medium text-neutral-700">{label}</span>
              <InlineValue
                value={String(input[key] ?? "")}
                editing
                multiline={key === "objectLine" || key === "volume"}
                onChange={(v) => set(key, v)}
              />
            </label>
          ))}
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Итоговый текст (можно править целиком)</span>
            <Textarea
              value={text}
              onChange={(e) => onChange({ ...input, messageOverride: e.target.value })}
              className={cn(
                "min-h-[12rem] text-[15px] leading-7",
                "border-sky-300/90 bg-sky-50 text-neutral-900 shadow-none",
                "placeholder:text-neutral-500 focus-visible:ring-sky-400",
              )}
            />
          </label>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-4 text-[15px] leading-7 text-neutral-900">
          {text}
        </pre>
      )}
    </div>
  );
}

function LabMosgazEditor({
  input,
  editing,
  onChange,
}: {
  input: LabMosgazFillInput;
  editing: boolean;
  onChange: (input: LabMosgazFillInput) => void;
}) {
  const letter = useMemo(() => labMosgazLetterBody(input), [input]);

  const set = <K extends keyof LabMosgazFillInput>(key: K, value: LabMosgazFillInput[K]) => {
    const next = { ...input, [key]: value };
    if (key !== "letterOverride") {
      next.letterOverride = labMosgazRebuildLetter({ ...next, letterOverride: null });
    }
    onChange(next);
  };

  return (
    <LetterheadShell>
      <div className="space-y-4 px-5 py-5 text-sm leading-relaxed text-neutral-900">
        <div className="font-semibold text-neutral-900">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Исх. №</span>
              <InlineValue
                value={input.outNumber}
                editing
                onChange={(v) => set("outNumber", v)}
                inputClassName="w-24"
                placeholder="№"
              />
              <span>от</span>
              <InlineValue
                value={input.letterDate}
                editing
                type="date"
                onChange={(v) => set("letterDate", v)}
                inputClassName="w-40"
              />
            </div>
          ) : (
            <p>{`Исх. № ${input.outNumber.trim() || "…"} от ${formatLongRuDate(input.letterDate)}`}</p>
          )}
        </div>
        <div className="text-right font-medium text-neutral-900">
          {LAB_MOSGAZ_RECIPIENT_LINES.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <p className="text-center text-base font-bold tracking-wide text-neutral-900">ФАКСОГРАММА</p>
        <InlineValue
          value={letter}
          editing={editing}
          multiline
          onChange={editing ? (v) => onChange({ ...input, letterOverride: v }) : undefined}
          className="text-[15px] leading-7"
          inputClassName="min-h-[12rem] text-[15px] leading-7"
        />
        <DirectorFooter
          editing={editing}
          performer={input.performer || DEFAULT_PERFORMER}
          onPerformerChange={(v) => set("performer", v)}
        />
      </div>
    </LetterheadShell>
  );
}
