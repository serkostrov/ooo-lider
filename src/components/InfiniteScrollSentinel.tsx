import { useEffect, useRef, type RefObject } from "react";

/**
 * Невидимый маркер внизу списка: когда он входит в зону скролла —
 * запрашиваем следующий курсор (infinite scroll).
 */
export function InfiniteScrollSentinel({
  rootRef,
  hasMore,
  loading,
  onLoadMore,
  /** Запас до низа, px — подгружаем чуть заранее. */
  rootMargin = "240px",
}: {
  rootRef?: RefObject<Element | null>;
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!hasMore || loading) return;
    const node = sentinelRef.current;
    if (!node) return;

    const root = rootRef?.current ?? null;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMoreRef.current();
      },
      { root, rootMargin, threshold: 0 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, rootRef, rootMargin]);

  if (!hasMore && !loading) return null;

  return (
    <div
      ref={sentinelRef}
      className="flex h-10 items-center justify-center text-xs text-muted-foreground"
      aria-hidden={!loading}
    >
      {loading ? "Загрузка…" : null}
    </div>
  );
}
