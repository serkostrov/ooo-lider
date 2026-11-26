import { supabase } from "@/integrations/supabase/client";
import { BUCKET } from "@/lib/files";
import type { FieldValue, RequestRow } from "@/components/requests/data";
import {
  buildGeotrestFillInput,
  geotrestMessageBody,
  type GeotrestFillInput,
} from "@/lib/request-docs/geotrest";
import {
  buildLabIntegralFillInput,
  defaultLabIntegralTableRows,
  fillLabIntegralDocx,
  LAB_MOSGAZ_TABLE_RECIPIENT,
  labIntegralFileName,
  labMosgazTableFileName,
  type LabIntegralFillInput,
} from "@/lib/request-docs/labIntegral";
import {
  buildLabMosgazFillInput,
  fillLabMosgazDocx,
  labMosgazFileName,
  labMosgazLetterBody,
  type LabMosgazFillInput,
} from "@/lib/request-docs/labMosgaz";
import {
  buildTechnadzorFillInput,
  DOCX_MIME,
  fillTechnadzorWorkbook,
  technadzorFileName,
  type TechnadzorFillInput,
} from "@/lib/request-docs/technadzor";
import {
  buildDocValueMap,
  objectCtxToFlat,
  overlayIntegralOnMap,
  overlayTechnadzorOnMap,
  resolveExcelColumnValues,
  resolveTableRows,
} from "@/lib/request-docs/blankResolve";
import { parseBlankConfig } from "@/components/directories/blank-templates/data";
import { presetConfigForEngine } from "@/components/directories/blank-constructor/enginePresets";
import type { BlankConfig, BlankEngine } from "@/components/directories/blank-constructor/types";
import type { RequestField } from "@/components/directories/request-types/data";

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
  geotrest?: GeotrestFillInput;
};

async function loadObjectCtx(objectId: string) {
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
    const { data: c } = await supabase
      .from("customers")
      .select("name")
      .eq("id", obj.customer_id)
      .maybeSingle();
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
    geotrest: {
      name: obj.name ?? "",
      address: obj.address ?? "",
      projectNumber: obj.project_number ?? "",
    },
    customer,
  };
}

async function loadFieldValues(requestId: string): Promise<FieldValue[]> {
  const { data, error } = await supabase
    .from("request_field_values")
    .select("request_id, field_id, label, field_type, value")
    .eq("request_id", requestId);
  if (error) throw error;
  return (data ?? []) as FieldValue[];
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

async function resolveOutContent(args: {
  r: RequestRow;
  draft: RequestDocDraft | null;
  kind: PreviewKind | null;
  values: FieldValue[];
  objectCtx: Awaited<ReturnType<typeof loadObjectCtx>> | null;
}): Promise<string> {
  const { r, draft, kind, objectCtx } = args;
  let values = args.values;

  if (kind === "geotrest_message" || draft?.template === "geotrest_message") {
    if (draft?.geotrest) {
      return geotrestMessageBody(draft.geotrest);
    }
    try {
      if (!values.length) values = await loadFieldValues(r.id);
      const fields = await loadFields(r.request_type_id);
      const input = buildGeotrestFillInput({
        callDate: r.call_date,
        values,
        fields,
        objectCtx: objectCtx?.geotrest ?? {
          name: r.object_name ?? "",
          address: "",
          projectNumber: "",
        },
      });
      return geotrestMessageBody(input);
    } catch (e) {
      console.warn("[registrySyncOnSent] geotrest rebuild failed", e);
    }
  }

  return `Заявка №${r.number} «${r.type_name}»`;
}

async function tryBuildBlankFile(args: {
  r: RequestRow;
  values: FieldValue[];
  kind: PreviewKind;
  blankConfig: BlankConfig;
  draft: RequestDocDraft | null;
  objectCtx: Awaited<ReturnType<typeof loadObjectCtx>>;
  fields: RequestField[];
}): Promise<{ filename: string; mime: string; buf: ArrayBuffer } | null> {
  const { r, values, kind, blankConfig, draft, objectCtx, fields } = args;
  if (kind === "geotrest_message") return null;

  const valueMap = buildDocValueMap({
    requestNumber: r.number,
    callDate: r.call_date,
    values,
    fields,
    object: objectCtxToFlat(objectCtx),
  });

  try {
    if (kind === "technadzor_xlsx") {
      let input = buildTechnadzorFillInput({
        callDate: r.call_date,
        values,
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
      const buf = await fillTechnadzorWorkbook(input, excelValues);
      return {
        filename: technadzorFileName(r.number, r.call_date),
        mime: XLSX_MIME,
        buf,
      };
    }
    if (kind === "lab_mosgaz_docx") {
      let input = buildLabMosgazFillInput({
        requestNumber: r.number,
        callDate: r.call_date,
        values,
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
      const buf = await fillLabMosgazDocx(input);
      return {
        filename: labMosgazFileName(r.number, r.call_date),
        mime: DOCX_MIME,
        buf,
      };
    }
    if (kind === "lab_integral_docx" || kind === "lab_mosgaz_table_docx") {
      const isMosgazTable = kind === "lab_mosgaz_table_docx";
      const recipient =
        blankConfig.recipientLines[0]?.trim() ||
        (isMosgazTable ? LAB_MOSGAZ_TABLE_RECIPIENT : "");
      let input = buildLabIntegralFillInput({
        requestNumber: r.number,
        callDate: r.call_date,
        values,
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
      const buf = await fillLabIntegralDocx(input, tableRows);
      return {
        filename: isMosgazTable
          ? labMosgazTableFileName(r.number, r.call_date)
          : labIntegralFileName(r.number, r.call_date),
        mime: DOCX_MIME,
        buf,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * После перехода в sent: upsert строки реестра, текст исходящего, файл бланка в storage.
 * Ошибки не бросаем наружу статуса — логируем в консоль (статус уже выставлен).
 */
export async function registrySyncOnSent(args: {
  r: RequestRow;
  values?: FieldValue[];
}): Promise<void> {
  const { r } = args;
  const values = args.values ?? [];

  try {
    const [{ data: typeRow }, draftRes, objectCtx] = await Promise.all([
      supabase
        .from("request_types")
        .select("doc_template, blank_template_id, name")
        .eq("id", r.request_type_id)
        .maybeSingle(),
      supabase.from("requests").select("doc_draft" as never).eq("id", r.id).maybeSingle(),
      loadObjectCtx(r.object_id).catch(() => null),
    ]);

    const kind = (typeRow?.doc_template ?? null) as PreviewKind | null;
    const draft =
      (draftRes.data as { doc_draft?: RequestDocDraft | null } | null)?.doc_draft ?? null;
    const content = await resolveOutContent({
      r,
      draft,
      kind,
      values,
      objectCtx,
    });
    const counterparty = objectCtx?.customer ?? "";

    const { data: entryId, error: upsertErr } = await supabase.rpc(
      "registry_upsert_on_sent" as never,
      {
        p_request_id: r.id,
        p_out_content: content,
        p_out_doc_path: null,
        p_counterparty: counterparty || null,
      } as never,
    );
    if (upsertErr) throw upsertErr;
    const id = entryId as string | null;
    if (!id) return;

    if (!kind || !objectCtx) return;

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
    if (kind === "geotrest_message") {
      const text = content;
      const enc = new TextEncoder().encode(text);
      const file = {
        filename: `geotrest-${r.number}.txt`,
        mime: "text/plain;charset=utf-8",
        buf: enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength),
      };
      const path = `${r.object_id}/registry/${id}/out.txt`;
      const blob = new Blob([file.buf], { type: file.mime });
      const up = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: file.mime,
        upsert: true,
      });
      if (up.error) throw up.error;
      const { error: pathErr } = await supabase.rpc("registry_upsert_on_sent" as never, {
        p_request_id: r.id,
        p_out_content: content,
        p_out_doc_path: path,
        p_counterparty: counterparty || null,
      } as never);
      if (pathErr) throw pathErr;
      return;
    }

    if (!blankConfig) {
      try {
        blankConfig = presetConfigForEngine(engine);
      } catch {
        return;
      }
    }
    if (!blankConfig) return;

    const fields = await loadFields(r.request_type_id);
    const file = await tryBuildBlankFile({
      r,
      values,
      kind,
      blankConfig,
      draft,
      objectCtx,
      fields,
    });
    if (!file) return;

    const ext =
      file.filename.includes(".")
        ? file.filename.slice(file.filename.lastIndexOf("."))
        : ".bin";
    const path = `${r.object_id}/registry/${id}/out${ext}`;
    const blob = new Blob([file.buf], { type: file.mime });
    const up = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: file.mime,
      upsert: true,
    });
    if (up.error) throw up.error;

    const { error: pathErr } = await supabase.rpc("registry_upsert_on_sent" as never, {
      p_request_id: r.id,
      p_out_content: content,
      p_out_doc_path: path,
      p_counterparty: counterparty || null,
    } as never);
    if (pathErr) throw pathErr;
  } catch (e) {
    console.error("[registrySyncOnSent]", e);
  }
}
