import { useMemo, useState } from "react";

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

/** Клик по колонке: ↑ → ↓ → сброс. */
export function useTableSort<K extends string>(initial: SortState<K> | null = null) {
  const [sort, setSort] = useState<SortState<K> | null>(initial);

  const toggle = (key: K) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

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
