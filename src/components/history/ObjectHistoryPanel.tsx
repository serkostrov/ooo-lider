import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/DateField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import {
  HISTORY_ENTITY_TYPES,
  HISTORY_EVENT_TYPES,
  historyEventActions,
} from "@/components/history/eventTypes";

const ALL = "__all";

/** История внутри карточки объекта: сущность / событие / даты. */
export function ObjectHistoryPanel({ objectId }: { objectId: string }) {
  const [entityType, setEntityType] = useState(ALL);
  const [eventType, setEventType] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const eventActions = eventType === ALL ? undefined : historyEventActions(eventType);
  const hasFilters = entityType !== ALL || eventType !== ALL || !!from || !!to;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="h-9 w-full text-sm sm:w-44">
            <SelectValue placeholder="Сущность" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-sm">
              Все сущности
            </SelectItem>
            {HISTORY_ENTITY_TYPES.map((t) => (
              <SelectItem key={t.v} value={t.v} className="text-sm">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="h-9 w-full text-sm sm:w-52">
            <SelectValue placeholder="Событие" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-sm">
              Все события
            </SelectItem>
            {HISTORY_EVENT_TYPES.map((t) => (
              <SelectItem key={t.v} value={t.v} className="text-sm">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
          <label className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <span className="shrink-0">с</span>
            <DateField
              value={from}
              onChange={setFrom}
              aria-label="Дата с"
              className="h-9 w-full min-w-0 flex-1 sm:w-[11.5rem] sm:flex-none"
            />
          </label>
          <label className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <span className="shrink-0">по</span>
            <DateField
              value={to}
              onChange={setTo}
              aria-label="Дата по"
              className="h-9 w-full min-w-0 flex-1 sm:w-[11.5rem] sm:flex-none"
              {...(from ? { min: from } : {})}
            />
          </label>
        </div>
        {hasFilters ? (
          <Button
            variant="ghost"
            className="h-9 text-sm"
            onClick={() => {
              setEntityType(ALL);
              setEventType(ALL);
              setFrom("");
              setTo("");
            }}
          >
            Сбросить
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <HistoryFeed
          fillHeight
          filter={{
            objectId,
            ...(entityType !== ALL ? { entityType } : {}),
            ...(eventActions ? { actions: eventActions } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          }}
        />
      </div>
    </div>
  );
}
