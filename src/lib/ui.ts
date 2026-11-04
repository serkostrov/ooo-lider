/**
 * Общие классы оформления UI.
 *
 * Радиусы (единые):
 * - rounded-xl — поверхности и контролы: таблицы, карточки, инпуты, кнопки, диалоги
 * - rounded-lg — вложенные блоки / активный таб внутри поверхности
 * - rounded-md — бейджи и мелкие чипы
 */

/** Высота ряда контролов = h-9 (как Input / Select / Button). */
export const CONTROL_H = "h-9";

/** Стек «подпись → поле»: единый отступ во всех формах. */
export const fieldStackClass = "flex flex-col gap-1.5";

/** Подпись поля (Label / dt). */
export const fieldLabelClass = "block text-sm font-medium leading-none text-muted-foreground";

export const tabsListClass =
  "mb-4 inline-flex h-9 max-w-full flex-wrap items-center justify-start gap-0.5 rounded-xl bg-muted p-0.5";

export const tabTriggerClass =
  "h-8 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground " +
  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm " +
  "disabled:opacity-40";

/** Обёртка таблицы / списка со скроллом */
export const tableWrapClass = "overflow-x-auto rounded-xl border border-border bg-card";

/** Панель без горизонтального скролла (clip углов шапки) */
export const panelClass = "overflow-hidden rounded-xl border border-border bg-card";

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
  `${TH_H} border-b border-border bg-muted/40 px-5 text-left align-middle ${thLabelClass}`;

export const tdClass = `${TD_H} border-b border-border/70 px-5 py-0 align-middle text-foreground`;

export const trHoverClass = "transition-colors hover:bg-elevated/50";
