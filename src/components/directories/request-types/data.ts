import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const REQUEST_TYPES_KEY = ["dir-request-types"] as const;

export type RequestType = {
  id: string;
  name: string;
  sort: number;
  is_active: boolean;
  uses_representatives: boolean;
  send_to_email: string | null;
};

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "file" | "picket_range";

export type RequestField = {
  id: string;
  request_type_id: string;
  label: string;
  field_type: FieldType;
  options: string[];
  is_required: boolean;
  filled_by: "initiator" | "office";
  sort: number;
  is_active: boolean;
};

export const FIELD_TYPES: { v: FieldType; label: string }[] = [
  { v: "text", label: "Текст" },
  { v: "textarea", label: "Многострочный текст" },
  { v: "number", label: "Число" },
  { v: "date", label: "Дата" },
  { v: "select", label: "Выпадающий список" },
  { v: "checkbox", label: "Галочка" },
  { v: "file", label: "Файл (фото, видео, PDF)" },
  { v: "picket_range", label: "Пикеты (от – до)" },
];

export const FILLED_BY: { v: RequestField["filled_by"]; label: string }[] = [
  { v: "initiator", label: "Прораб при создании" },
  { v: "office", label: "Офис-менеджер" },
];

export function useRequestTypes() {
  return useQuery({
    queryKey: REQUEST_TYPES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_types")
        .select("id, name, sort, is_active, uses_representatives, send_to_email")
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as RequestType[];
    },
  });
}

/** Поля всех видов (без удалённых) — для счётчиков и карточки. */
export function useRequestFields(typeId?: string) {
  return useQuery({
    queryKey: ["dir-request-fields", typeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("request_type_fields")
        .select("id, request_type_id, label, field_type, options, is_required, filled_by, sort, is_active")
        .is("deleted_at", null)
        .order("sort");
      if (typeId) q = q.eq("request_type_id", typeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((f) => ({
        ...f,
        options: Array.isArray(f.options) ? (f.options as unknown[]).map(String) : [],
      })) as RequestField[];
    },
  });
}
