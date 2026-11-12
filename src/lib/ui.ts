/**
 * Общие классы оформления UI.
 *
 * Радиусы (умеренные):
 * - rounded-xl / rounded-lg — крупные поверхности (реестры, карточки объектов)
 * - rounded-md — контролы: инпуты, кнопки, диалоги
 * - rounded-sm — вложенные блоки / активный таб
 */

/** Высота ряда контролов = h-9 (как Input / Select / Button). */
export const CONTROL_H = "h-9";

/** Стек «подпись → поле»: единый отступ во всех формах. */
export const fieldStackClass = "flex flex-col gap-2";

/** Подпись поля (Label / dt). */
export const fieldLabelClass = "block text-sm font-medium leading-snug text-muted-foreground";

export const tabsListClass =
  "mb-4 inline-flex h-9 max-w-full flex-wrap items-center justify-start gap-0.5 rounded-md bg-muted p-0.5";

export const tabTriggerClass =
  "h-8 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground " +
  "data-[state=active]:bg-card data-[state=active]:text-foreground " +
  "disabled:opacity-40";

/** Обёртка таблицы: по содержимому, max = высота PageFrame; скролл при переполнении */
export const tableWrapClass =
  "max-h-full min-h-0 overflow-auto rounded-xl border border-border/70 bg-card shadow-[var(--surface-glow)] backdrop-blur-[2px]";

/** Панель без горизонтального скролла (clip углов шапки) */
export const panelClass =
  "h-full min-h-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--surface-glow)] backdrop-blur-[2px]";

/** Базовые классы HTML-таблицы (когда ui/table не используется) */
export const tableClass = "w-full min-w-[720px] border-collapse text-sm";

/**
 * Типографика заголовка колонки — единая для <th> и list-шапок (Reorderable и т.п.).
 * Не задаёт padding/высоту: их даёт thClass или контейнер шапки.
 */
export const thLabelClass =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

/** Высота шапки таблицы — фиксированная, чтобы sortable и plain совпадали. */
export const TH_H = "h-10";

/** Высота строки данных таблицы — единая (вмещает ToneBadge и ↑↓ size-8). */
export const TD_H = "h-12";

/** Ширина колонки ↑↓ (2× size-8) — одна и та же в шапке и в строке. */
export const REORDER_ACTIONS_W = "w-16";

/** Ячейка заголовка таблицы (<th> / TableHead). */
export const thClass =
  `${TH_H} border-b border-border/80 bg-elevated/80 px-5 text-left align-middle ${thLabelClass}`;

export const tdClass = `${TD_H} border-b border-border/55 px-5 py-0 align-middle text-foreground`;

export const trHoverClass = "transition-colors hover:bg-elevated/50";
