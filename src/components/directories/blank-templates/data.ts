import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type BlankConfig,
  type BlankEngine,
  type BlankFormat,
  defaultConfig,
} from "../blank-constructor/types";
import { presetConfigForEngine } from "../blank-constructor/enginePresets";

export const BLANK_TEMPLATES_KEY = ["dir-blank-templates"] as const;

export type BlankTemplate = {
  id: string;
  name: string;
  format: BlankFormat | null;
  engine: BlankEngine | null;
  config: BlankConfig;
  sort: number;
  is_active: boolean;
  is_draft: boolean;
};

export type BlankTemplateUsage = {
  id: string;
  name: string;
  is_active: boolean;
};

function parseFormat(raw: string | null): BlankFormat | null {
  if (
    raw === "word_table" ||
    raw === "word_fax" ||
    raw === "excel" ||
    raw === "message"
  ) {
    return raw;
  }
  return null;
}

function parseEngine(raw: string | null): BlankEngine | null {
  if (!raw) return null;
  const ok = [
    "technadzor_xlsx",
    "lab_mosgaz_table_docx",
    "lab_mosgaz_docx",
    "lab_integral_docx",
    "geotrest_message",
  ] as const;
  return (ok as readonly string[]).includes(raw) ? (raw as BlankEngine) : null;
}

function withIds<T extends { id?: string }>(items: T[]): (T & { id: string })[] {
  return items.map((item) => ({
    ...item,
    id: item.id && String(item.id).trim() ? String(item.id) : crypto.randomUUID(),
  }));
}

/** Разбор config из БД; пустые строки/колонки подставляются из пресета движка. */
export function parseBlankConfig(
  raw: unknown,
  format: BlankFormat | null,
  engine: BlankEngine | null,
): BlankConfig {
  const preset = engine ? presetConfigForEngine(engine) : null;
  const base = preset ?? defaultConfig(format);
  if (!raw || typeof raw !== "object") return { ...base, format: format ?? base.format };
  const c = raw as Partial<BlankConfig>;
  const tableRows =
    Array.isArray(c.tableRows) && c.tableRows.length > 0
      ? withIds(c.tableRows as BlankConfig["tableRows"])
      : base.tableRows;
  const excelColumns =
    Array.isArray(c.excelColumns) && c.excelColumns.length > 0
      ? withIds(c.excelColumns as BlankConfig["excelColumns"])
      : base.excelColumns;
  const faxBody =
    typeof c.faxBody === "string" && c.faxBody.trim() ? c.faxBody : base.faxBody;
  const messageTemplate =
    typeof c.messageTemplate === "string" && c.messageTemplate.trim()
      ? c.messageTemplate
      : base.messageTemplate;
  const recipientLines =
    Array.isArray(c.recipientLines) && c.recipientLines.length > 0
      ? c.recipientLines.map(String)
      : base.recipientLines;
  return {
    ...base,
    ...c,
    format: c.format ?? format ?? base.format,
    recipientLines,
    showOutgoing: typeof c.showOutgoing === "boolean" ? c.showOutgoing : base.showOutgoing,
    outNumber: typeof c.outNumber === "string" ? c.outNumber : base.outNumber,
    letterDate: typeof c.letterDate === "string" ? c.letterDate : base.letterDate,
    tableRows,
    excelColumns,
    faxBody,
    messageTemplate,
  };
}

export function useBlankTemplates() {
  return useQuery({
    queryKey: BLANK_TEMPLATES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_blank_templates")
        .select("id, name, format, engine, config, sort, is_active, is_draft")
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []).map((row) => {
        const format = parseFormat(row.format);
        const engine = parseEngine(row.engine);
        return {
          id: row.id,
          name: row.name,
          format,
          engine,
          config: parseBlankConfig(row.config, format, engine),
          sort: row.sort,
          is_active: row.is_active,
          is_draft: row.is_draft === true,
        } satisfies BlankTemplate;
      });
    },
  });
}

/** Виды заявок, привязанные к шаблонам (для колонки «Используется»). */
export function useBlankTemplateUsages() {
  return useQuery({
    queryKey: [...BLANK_TEMPLATES_KEY, "usages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_types")
        .select("id, name, is_active, blank_template_id")
        .is("deleted_at", null)
        .not("blank_template_id", "is", null);
      if (error) throw error;
      const map = new Map<string, BlankTemplateUsage[]>();
      for (const t of data ?? []) {
        const tid = t.blank_template_id as string;
        const list = map.get(tid) ?? [];
        list.push({ id: t.id, name: t.name, is_active: t.is_active });
        map.set(tid, list);
      }
      return map;
    },
  });
}
