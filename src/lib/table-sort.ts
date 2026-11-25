import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export type SortState<K extends string> = { key: K; dir: SortDir };

/** Сравнение значений для сортировки таблиц (числа, даты-строки, текст). */
export function compareValues(a: unknown, b: unknown): number {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "ru", { numeric: true, sensitivity: "base" });
}

export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K> | null,
  getters: Record<K, (row: T) => unknown>,
): T[] {
  if (!sort) return rows;
  const get = getters[sort.key];
  if (!get) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compareValues(get(a), get(b)) * dir);
}

function readStoredSort<K extends string>(storageKey: string): SortState<K> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; dir?: unknown };
    if (typeof parsed?.key !== "string") return null;
    if (parsed.dir !== "asc" && parsed.dir !== "desc") return null;
    return { key: parsed.key as K, dir: parsed.dir };
  } catch {
    return null;
  }
}

function writeStoredSort<K extends string>(storageKey: string, sort: SortState<K> | null) {
  try {
    if (!sort) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(sort));
  } catch {
    /* private mode / quota */
  }
}

/**
 * Клик по колонке: ↑ → ↓ → сброс.
 * `storageKey` — сохранить сортировку в localStorage (не сбивается при уходе со страницы).
 */
export function useTableSort<K extends string>(
  initial: SortState<K> | null = null,
  opts?: { storageKey?: string },
) {
  const storageKey = opts?.storageKey;
  const [sort, setSortState] = useState<SortState<K> | null>(() => {
    if (storageKey) {
      const saved = readStoredSort<K>(storageKey);
      if (saved) return saved;
    }
    return initial;
  });

  const setSort = useCallback(
    (next: SortState<K> | null | ((prev: SortState<K> | null) => SortState<K> | null)) => {
      setSortState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        if (storageKey) writeStoredSort(storageKey, value);
        return value;
      });
    },
    [storageKey],
  );

  const toggle = useCallback(
    (key: K) => {
      setSort((s) => {
        if (!s || s.key !== key) return { key, dir: "asc" };
        if (s.dir === "asc") return { key, dir: "desc" };
        return null;
      });
    },
    [setSort],
  );

  return { sort, toggle, setSort };
}

/** Удобно: отсортированный список из getters. */
export function useSortedRows<T, K extends string>(
  rows: T[],
  sort: SortState<K> | null,
  getters: Record<K, (row: T) => unknown>,
) {
  return useMemo(() => sortRows(rows, sort, getters), [rows, sort, getters]);
}
