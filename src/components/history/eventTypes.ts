/** Группы событий по полю history.action */
export const HISTORY_EVENT_TYPES = [
  { v: "status_changed", label: "Смена статуса", actions: ["status_changed"] },
  { v: "created", label: "Создание", actions: ["created"] },
  {
    v: "messages",
    label: "Сообщения",
    actions: ["stage_message", "status_ask"],
  },
  {
    v: "emergency",
    label: "Нештатная ситуация",
    actions: ["emergency_on", "emergency_off"],
  },
  { v: "files", label: "Файлы", actions: ["file_uploaded"] },
  {
    v: "conditions",
    label: "Условия и шаги",
    actions: ["condition_set", "step_done"],
  },
  {
    v: "stages_structure",
    label: "Состав этапов",
    actions: [
      "stages_added",
      "substage_added",
      "adhoc_added",
      "excluded",
      "deleted",
      "code_changed",
    ],
  },
  { v: "deadlines", label: "Сроки", actions: ["deadlines_bulk"] },
  {
    v: "other",
    label: "Прочее",
    actions: ["completed", "call_date_changed"],
  },
] as const;

export const HISTORY_ENTITY_TYPES = [
  { v: "stage", label: "Этапы" },
  { v: "request", label: "Заявки" },
  { v: "object", label: "Объекты" },
] as const;

export function historyEventActions(eventType: string): string[] | undefined {
  if (!eventType) return undefined;
  const found = HISTORY_EVENT_TYPES.find((e) => e.v === eventType);
  return found ? [...found.actions] : undefined;
}
