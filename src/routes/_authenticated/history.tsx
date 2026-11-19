import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { useObjects } from "@/components/objects/data";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "История — Лидер" },
      { name: "description", content: "Журнал действий в системе «Лидер»" },
    ],
  }),
});

const ALL = "__all";

function HistoryPage() {
  const { data: objects = [] } = useObjects();
  const [objectId, setObjectId] = useState(ALL);
  const [entityType, setEntityType] = useState(ALL);
  const [eventType, setEventType] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const eventActions = eventType === ALL ? undefined : historyEventActions(eventType);

  const hasFilters =
    objectId !== ALL || entityType !== ALL || eventType !== ALL || !!from || !!to;

  return (
    <PageFrame
      header={
        <>
          <PageHeader
            title="История"
            description="Журнал действий по объектам, этапам и заявкам"
            className="mb-3"
            actions={
              hasFilters ? (
                <Button
                  variant="ghost"
                  className="h-9 text-sm"
                  onClick={() => {
                    setObjectId(ALL);
                    setEntityType(ALL);
                    setEventType(ALL);
                    setFrom("");
                    setTo("");
                  }}
                >
                  Сбросить
                </Button>
              ) : undefined
            }
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <Select value={objectId} onValueChange={setObjectId}>
              <SelectTrigger className="h-9 w-full text-sm sm:w-60">
                <SelectValue placeholder="Объект" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="text-sm">
                  Все объекты
                </SelectItem>
                {objects.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-sm">
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <div className="col-span-2 grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-2">
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
          </div>
        </>
      }
    >
      <HistoryFeed
        fillHeight
        showObject={objectId === ALL}
        filter={{
          ...(objectId !== ALL ? { objectId } : {}),
          ...(entityType !== ALL ? { entityType } : {}),
          ...(eventActions ? { actions: [...eventActions] } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }}
      />
    </PageFrame>
  );
}
