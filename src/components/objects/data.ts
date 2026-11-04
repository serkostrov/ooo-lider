import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const OBJECTS_KEY = ["objects"] as const;

export type ObjectRow = {
  id: string;
  name: string;
  address: string | null;
  customer_id: string | null;
  customer_name: string | null;
  object_type: string;
  contract_start: string | null;
  contract_end: string | null;
  contract_days_left: number | null;
  responsible_id: string | null;
  responsible_name: string | null;
  curator_contact_id: string | null;
  curator_name: string | null;
  technadzor_contact_id: string | null;
  technadzor_name: string | null;
  technadzor_ehz_contact_id: string | null;
  technadzor_ehz_name: string | null;
  status: "planned" | "in_work" | "completed";
  notes: string | null;
  stages_total: number;
  stages_closed: number;
  progress_pct: number;
  stages_overdue: number;
  stages_no_response: number;
  stages_on_review: number;
  stages_no_executor: number;
  current_stage_number: number | null;
  current_stage_name: string | null;
  requests_new: number;
  requests_overdue: number;
};

/** Справочник «Типы объектов» (правка 2.5, db/07). Удалённые тоже грузим — для подписей у старых объектов. */
export const OBJECT_TYPES_KEY = ["dir-object-types"] as const;
export type ObjectType = { code: string; name: string; sort: number; deleted_at: string | null };

export function useObjectTypes() {
  const q = useQuery({
    queryKey: OBJECT_TYPES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("object_types").select("code, name, sort, deleted_at").order("sort");
      if (error) throw error;
      return (data ?? []) as ObjectType[];
    },
  });
  const all = q.data ?? [];
  return {
    ...q,
    all,
    /** Для выбора — только не удалённые. */
    active: all.filter((t) => !t.deleted_at),
    label: (code: string | null | undefined) => all.find((t) => t.code === code)?.name ?? "",
  };
}

export const OBJECT_STATUSES = [
  { v: "planned", label: "Планируется" },
  { v: "in_work", label: "В работе" },
  { v: "completed", label: "Завершён (архив)" },
] as const;

/** Роли участников объекта (ТЗ 7.3, шаг 2). */
export const MEMBER_ROLES = [
  { code: "director", label: "Руководитель" },
  { code: "pto", label: "Инженер ПТО" },
  { code: "foreman", label: "Прораб" },
  { code: "supply", label: "Снабжение" },
  { code: "office", label: "Офис-менеджер" },
] as const;

export const statusLabel = (v: string | null | undefined) => OBJECT_STATUSES.find((t) => t.v === v)?.label ?? "";

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

function normalize(r: Record<string, unknown>): ObjectRow {
  return {
    ...(r as unknown as ObjectRow),
    stages_total: num(r["stages_total"]),
    stages_closed: num(r["stages_closed"]),
    progress_pct: num(r["progress_pct"]),
    stages_overdue: num(r["stages_overdue"]),
    stages_no_response: num(r["stages_no_response"]),
    stages_on_review: num(r["stages_on_review"]),
    stages_no_executor: num(r["stages_no_executor"]),
    requests_new: num(r["requests_new"]),
    requests_overdue: num(r["requests_overdue"]),
  };
}

/** Все видимые объекты (RLS и can_see_object — в представлении v_objects). */
export function useObjects() {
  return useQuery({
    queryKey: OBJECTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_objects").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
    },
  });
}

export function useObject(id: string) {
  return useQuery({
    queryKey: [...OBJECTS_KEY, id],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_objects").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? normalize(data as Record<string, unknown>) : null;
    },
  });
}

export type ProfileShort = { id: string; full_name: string; role_code: string };

export function useActiveProfiles() {
  return useQuery({
    queryKey: ["profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role_code")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileShort[];
    },
  });
}

export function useCustomersShort() {
  return useQuery({
    queryKey: ["dir-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, inn, kpp, ogrn, legal_address, comment")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Цвет срока по договору: ≤ 14 дн. — жёлтый, срок прошёл — красный (ТЗ 8). */
export const CONTRACT_WARN_DAYS = 14;

export function contractTone(daysLeft: number | null | undefined): "ok" | "warn" | "bad" | "none" {
  if (daysLeft === null || daysLeft === undefined) return "none";
  if (daysLeft < 0) return "bad";
  if (daysLeft <= CONTRACT_WARN_DAYS) return "warn";
  return "ok";
}

export function daysLeftText(daysLeft: number | null | undefined) {
  if (daysLeft === null || daysLeft === undefined) return "";
  if (daysLeft < 0) return `−${-daysLeft}д`;
  if (daysLeft === 0) return "сегодня";
  return `${daysLeft}д`;
}

export const TONE_CLASS: Record<"ok" | "warn" | "bad" | "none", string> = {
  ok: "",
  warn: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/30",
  bad: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/30",
  none: "",
};
