import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useProfile } from "@/lib/profile";

/** Общий потолок ширины колонки (как просили ~300px). */
export const COLUMN_MAX_DEFAULT = 300;
export const COLUMN_MIN_DEFAULT = 64;

export type ColumnWidthDef = {
  id: string;
  /** Стартовая ширина, px — чтобы текст нормально читался. */
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
};

export type ColumnWidths = Record<string, number>;

function settingsKey(profileId: string, tableId: string) {
  return ["user-settings", profileId, `table_cols:${tableId}`] as const;
}

function settingKey(tableId: string) {
  return `table_cols:${tableId}`;
}

export function clampColumnWidth(width: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function resolveColumnWidths(defs: ColumnWidthDef[], saved: ColumnWidths | null | undefined): ColumnWidths {
  const out: ColumnWidths = {};
  for (const d of defs) {
    const min = d.minWidth ?? COLUMN_MIN_DEFAULT;
    const max = d.maxWidth ?? COLUMN_MAX_DEFAULT;
    const raw = saved?.[d.id];
    out[d.id] = clampColumnWidth(
      typeof raw === "number" && Number.isFinite(raw) ? raw : d.defaultWidth,
      min,
      max,
    );
  }
  return out;
}

function parseSaved(value: unknown): ColumnWidths | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: ColumnWidths = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * Ширины колонок таблицы: локально сразу, на сервер (user_settings) — после отпускания.
 * Ключ: table_cols:{tableId}, отдельно на каждого пользователя.
 */
export function useTableColumnWidths(tableId: string, defs: ColumnWidthDef[]) {
  const { id: profileId } = useProfile();
  const qc = useQueryClient();
  const defsKey = defs.map((d) => `${d.id}:${d.defaultWidth}:${d.minWidth ?? ""}:${d.maxWidth ?? ""}`).join("|");
  const stableDefs = useMemo(() => defs, [defsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaults = useMemo(() => resolveColumnWidths(stableDefs, null), [stableDefs]);

  const query = useQuery({
    queryKey: settingsKey(profileId, tableId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("value")
        .eq("profile_id", profileId)
        .eq("key", settingKey(tableId))
        .maybeSingle();
      if (error) throw error;
      return parseSaved(data?.value);
    },
  });

  const [local, setLocal] = useState<ColumnWidths | null>(null);
  const serverMerged = useMemo(
    () => resolveColumnWidths(stableDefs, query.data),
    [stableDefs, query.data],
  );
  const widths = local ?? serverMerged;

  const save = useMutation({
    mutationFn: async (next: ColumnWidths) => {
      const { error } = await supabase.from("user_settings").upsert({
        profile_id: profileId,
        key: settingKey(tableId),
        value: next as unknown as Json,
      });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(settingsKey(profileId, tableId), next);
    },
  });

  const pending = useRef<ColumnWidths | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (next: ColumnWidths) => {
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const payload = pending.current;
        pending.current = null;
        if (payload) save.mutate(payload);
      }, 350);
    },
    [save],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const setWidth = useCallback(
    (columnId: string, width: number, opts?: { persist?: boolean }) => {
      const def = stableDefs.find((d) => d.id === columnId);
      if (!def) return;
      const min = def.minWidth ?? COLUMN_MIN_DEFAULT;
      const max = def.maxWidth ?? COLUMN_MAX_DEFAULT;
      const next = {
        ...widths,
        [columnId]: clampColumnWidth(width, min, max),
      };
      setLocal(next);
      if (opts?.persist !== false) persist(next);
    },
    [stableDefs, widths, persist],
  );

  const resetWidth = useCallback(
    (columnId: string) => {
      const def = stableDefs.find((d) => d.id === columnId);
      if (!def) return;
      setWidth(columnId, def.defaultWidth, { persist: true });
    },
    [stableDefs, setWidth],
  );

  const totalWidth = useMemo(
    () => stableDefs.reduce((sum, d) => sum + (widths[d.id] ?? d.defaultWidth), 0),
    [stableDefs, widths],
  );

  const resizeProps = useCallback(
    (columnId: string) => {
      const def = stableDefs.find((d) => d.id === columnId);
      return {
        width: widths[columnId] ?? def?.defaultWidth ?? COLUMN_MIN_DEFAULT,
        minWidth: def?.minWidth ?? COLUMN_MIN_DEFAULT,
        maxWidth: def?.maxWidth ?? COLUMN_MAX_DEFAULT,
        onResize: (w: number) => setWidth(columnId, w, { persist: false }),
        onResizeEnd: (w: number) => setWidth(columnId, w, { persist: true }),
        onReset: () => resetWidth(columnId),
      };
    },
    [stableDefs, widths, setWidth, resetWidth],
  );

  return { widths, totalWidth, setWidth, resetWidth, resizeProps, defaults };
}
