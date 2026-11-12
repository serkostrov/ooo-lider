/** Размер страницы для курсорных списков (История / Заявки / Объекты). */
export const PAGE_SIZE = 50;

export type CursorPage<T, C> = {
  rows: T[];
  /** Курсор следующей страницы; null — больше нет. */
  nextCursor: C | null;
};

/** Запрашиваем pageSize+1, лишний ряд — признак «есть ещё». */
export function takePage<T>(rows: T[], pageSize: number): { rows: T[]; hasMore: boolean } {
  if (rows.length > pageSize) {
    return { rows: rows.slice(0, pageSize), hasMore: true };
  }
  return { rows, hasMore: false };
}

/** Паттерн для ilike: убираем метасимволы LIKE и запятые (ломают .or()). */
export function likeContains(raw: string): string | null {
  const q = raw.trim().replace(/[%_,*()"'\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return null;
  return `%${q}%`;
}
