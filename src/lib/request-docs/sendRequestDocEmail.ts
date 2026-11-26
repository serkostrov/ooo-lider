import { supabase } from "@/integrations/supabase/client";
import type { RequestField } from "@/components/directories/request-types/data";
import type { FieldValue, RequestRow } from "@/components/requests/data";
import {
  buildLabIntegralFillInput,
  defaultLabIntegralTableRows,
  fillLabIntegralDocx,
  LAB_MOSGAZ_TABLE_RECIPIENT,
  labIntegralFileName,
  labMosgazTableFileName,
  type LabIntegralFillInput,
  type LabIntegralObjectCtx,
} from "./labIntegral";
import {
  buildLabMosgazFillInput,
  fillLabMosgazDocx,
  labMosgazFileName,
  labMosgazLetterBody,
  type LabMosgazFillInput,
  type LabMosgazObjectCtx,
} from "./labMosgaz";
import {
  buildTechnadzorFillInput,
  DOCX_MIME,
  fillTechnadzorWorkbook,
  technadzorFileName,
  type TechnadzorFillInput,
  type TechnadzorObjectCtx,
} from "./technadzor";
import {
  buildDocValueMap,
  objectCtxToFlat,
  overlayIntegralOnMap,
  overlayTechnadzorOnMap,
  resolveExcelColumnValues,
  resolveTableRows,
} from "./blankResolve";
import { parseBlankConfig } from "@/components/directories/blank-templates/data";
import { presetConfigForEngine } from "@/components/directories/blank-constructor/enginePresets";
import type { BlankConfig, BlankEngine } from "@/components/directories/blank-constructor/types";
import { resolveEmailSubtitle, resolveEmailTitle } from "./emailCopy";
import { formatDate } from "@/lib/format";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type PreviewKind =
  | "technadzor_xlsx"
  | "lab_mosgaz_docx"
  | "lab_mosgaz_table_docx"
  | "lab_integral_docx"
  | "geotrest_message";

type RequestDocDraft = {
  template: PreviewKind;
  mosgaz?: LabMosgazFillInput;
  integral?: LabIntegralFillInput;
  technadzor?: TechnadzorFillInput;
};

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadObjectCtx(objectId: string): Promise<{
  technadzor: TechnadzorObjectCtx;
  lab: LabMosgazObjectCtx;
  integral: LabIntegralObjectCtx;
}> {
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

  return {
    technadzor: {
      address: obj.address ?? "",
      projectNumber: obj.project_number ?? "",
      utnNumber: obj.utn_number ?? "",
      utnDate: obj.utn_date ?? null,
      customer,
      inspector,
    },
    lab: {
      name: obj.name ?? "",
      address: obj.address ?? "",
      projectNumber: obj.project_number ?? "",
    },
    integral: {
      name: obj.name ?? "",
      address: obj.address ?? "",
      utnNumber: obj.utn_number ?? "",
      utnDate: obj.utn_date ?? null,
    },
  };
}

async function loadFields(typeId: string): Promise<RequestField[]> {
  const { data, error } = await supabase
    .from("request_type_fields")
    .select(
      "id, request_type_id, label, field_type, options, is_required, filled_by, sort, is_active, default_value",
    )
    .eq("request_type_id", typeId)
    .is("deleted_at", null)
    .order("sort");
  if (error) throw error;
  return (data ?? []).map((f) => ({
    ...f,
    options: Array.isArray(f.options) ? (f.options as unknown[]).map(String) : [],
    default_value: f.default_value ?? null,
  })) as RequestField[];
}

/** Собрать бланк заявки (как при скачивании) и отправить на email через Edge Function. */
export async function sendRequestDocEmail(args: {
  r: RequestRow;
  values: FieldValue[];
  to: string;
  /** Тема письма (если пусто — из шаблона вида / дефолт). */
  subject?: string;
  /** Текст сопроводительного письма. */
  text?: string;
}): Promise<{ ok: true; to: string; filename: string } | { ok: false; error: string }> {
  const to = args.to.trim();
  if (!to) return { ok: false, error: "Не указан email получателя" };

  const { data: typeRow, error: typeErr } = await supabase
    .from("request_types")
    .select("doc_template, name, blank_template_id, email_title, email_subtitle")
    .eq("id", args.r.request_type_id)
    .maybeSingle();
  if (typeErr) return { ok: false, error: typeErr.message };

  const kind = (typeRow?.doc_template ?? null) as PreviewKind | null;
  if (kind === "geotrest_message") {
    return {
      ok: false,
      error: "Геотрест отправляют сообщением в Max — откройте бланк и скопируйте текст",
    };
  }
  if (
    kind !== "technadzor_xlsx" &&
    kind !== "lab_mosgaz_docx" &&
    kind !== "lab_mosgaz_table_docx" &&
    kind !== "lab_integral_docx"
  ) {
    return { ok: false, error: "У этого вида заявки нет бланка для отправки" };
  }

  let blankConfig: BlankConfig | null = null;
  const engine = kind as BlankEngine;
  if (typeRow?.blank_template_id) {
    const { data: tpl } = await supabase
      .from("request_blank_templates")
      .select("config, format, engine")
      .eq("id", typeRow.blank_template_id)
      .maybeSingle();
    if (tpl) {
      blankConfig = parseBlankConfig(
        tpl.config,
        (tpl.format as BlankConfig["format"]) ?? null,
        (tpl.engine as BlankEngine | null) ?? engine,
      );
    }
  }
  if (!blankConfig) blankConfig = presetConfigForEngine(engine);

  const [fields, objectCtx, draftRes] = await Promise.all([
    loadFields(args.r.request_type_id),
    loadObjectCtx(args.r.object_id),
    supabase.from("requests").select("doc_draft" as never).eq("id", args.r.id).maybeSingle(),
  ]);
  if (draftRes.error) return { ok: false, error: draftRes.error.message };
  const draft = (draftRes.data as { doc_draft?: RequestDocDraft | null } | null)?.doc_draft ?? null;

  let filename: string;
  let mime: string;
  let buf: ArrayBuffer;

  const valueMap = buildDocValueMap({
    requestNumber: args.r.number,
    callDate: args.r.call_date,
    values: args.values,
    fields,
    object: objectCtxToFlat(objectCtx),
  });

  if (kind === "technadzor_xlsx") {
    let input = buildTechnadzorFillInput({
      callDate: args.r.call_date,
      values: args.values,
      fields,
      objectCtx: objectCtx.technadzor,
    });
    if (draft?.template === kind && draft.technadzor) {
      input = { ...input, ...draft.technadzor };
    }
    const excelValues =
      blankConfig.excelColumns.length > 0
        ? resolveExcelColumnValues(
            blankConfig.excelColumns,
            overlayTechnadzorOnMap(valueMap, input),
          )
        : null;
    buf = await fillTechnadzorWorkbook(input, excelValues);
    filename = technadzorFileName(args.r.number, args.r.call_date);
    mime = XLSX_MIME;
  } else if (kind === "lab_mosgaz_docx") {
    let input = buildLabMosgazFillInput({
      requestNumber: args.r.number,
      callDate: args.r.call_date,
      values: args.values,
      fields,
      objectCtx: objectCtx.lab,
    });
    input = { ...input, letterOverride: labMosgazLetterBody(input) };
    if (draft?.template === kind && draft.mosgaz) {
      input = {
        ...input,
        ...draft.mosgaz,
        performer: draft.mosgaz.performer?.trim() || input.performer,
      };
    }
    buf = await fillLabMosgazDocx(input);
    filename = labMosgazFileName(args.r.number, args.r.call_date);
    mime = DOCX_MIME;
  } else {
    const isMosgazTable = kind === "lab_mosgaz_table_docx";
    const recipient =
      blankConfig.recipientLines[0]?.trim() ||
      (isMosgazTable ? LAB_MOSGAZ_TABLE_RECIPIENT : "");
    let input = buildLabIntegralFillInput({
      requestNumber: args.r.number,
      callDate: args.r.call_date,
      values: args.values,
      fields,
      objectCtx: objectCtx.integral,
      ...(recipient ? { recipient } : {}),
    });
    if (
      draft?.integral &&
      (draft.template === kind ||
        draft.template === "lab_integral_docx" ||
        draft.template === "lab_mosgaz_table_docx")
    ) {
      input = {
        ...input,
        ...draft.integral,
        projectReg: draft.integral.projectReg ?? input.projectReg ?? "",
        performer: draft.integral.performer?.trim() || input.performer,
      };
    }
    const tableRows =
      blankConfig.tableRows.length > 0
        ? resolveTableRows(blankConfig, overlayIntegralOnMap(valueMap, input))
        : defaultLabIntegralTableRows(input);
    buf = await fillLabIntegralDocx(input, tableRows);
    filename = isMosgazTable
      ? labMosgazTableFileName(args.r.number, args.r.call_date)
      : labIntegralFileName(args.r.number, args.r.call_date);
    mime = DOCX_MIME;
  }

  const typeName = typeRow?.name || args.r.type_name;
  const copyVars = {
    number: args.r.number,
    type: typeName,
    object: args.r.object_name ?? "",
    call_date: formatDate(args.r.call_date),
  };
  const typeMeta = typeRow as
    | { email_title?: string | null; email_subtitle?: string | null }
    | null
    | undefined;
  const subject =
    (args.subject ?? "").trim() ||
    resolveEmailTitle(typeMeta?.email_title, copyVars, valueMap);
  const text =
    (args.text ?? "").trim() ||
    resolveEmailSubtitle(typeMeta?.email_subtitle, copyVars, valueMap);

  const { data, error } = await supabase.functions.invoke("send-request-doc", {
    body: {
      request_id: args.r.id,
      to,
      subject,
      text,
      filename,
      content_base64: arrayBufferToBase64(buf),
      content_type: mime,
    },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const j = (await ctx.json()) as { error?: string; detail?: string };
        if (j?.error) {
          return { ok: false, error: j.detail ? `${j.error}: ${j.detail}` : j.error };
        }
      } catch {
        /* ignore */
      }
    }
    const raw = error.message ?? String(error);
    if (raw.includes("Failed to send") || raw.includes("non-2xx")) {
      return {
        ok: false,
        error: "Функция отправки не запущена или вернула ошибку. Локально: npm run functions",
      };
    }
    return { ok: false, error: raw };
  }

  const res = data as {
    ok?: boolean;
    error?: string;
    detail?: string;
    to?: string;
    filename?: string;
  } | null;
  if (!res?.ok) {
    const msg = res?.detail ? `${res.error}: ${res.detail}` : res?.error;
    return { ok: false, error: msg || "Не удалось отправить письмо" };
  }
  return { ok: true, to: res.to || to, filename: res.filename || filename };
}
