import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { useObjects } from "@/components/objects/data";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar } from "@/components/FilterBar";

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
const TYPES = [
  { v: "stage", label: "Этапы" },
  { v: "request", label: "Заявки" },
  { v: "object", label: "Объекты" },
];

function HistoryPage() {
  const { data: objects = [] } = useObjects();
  const [objectId, setObjectId] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div>
      <PageHeader title="История" description="Журнал действий по объектам, этапам и заявкам" />
      <FilterBar
        actions={
          objectId !== ALL || type !== ALL || from || to ? (
            <Button
              variant="ghost"
              className="h-9 text-sm"
              onClick={() => {
                setObjectId(ALL);
                setType(ALL);
                setFrom("");
                setTo("");
              }}
            >
              Сбросить
            </Button>
          ) : undefined
        }
      >
        <Select value={objectId} onValueChange={setObjectId}>
          <SelectTrigger className="h-9 w-60 text-sm">
            <SelectValue />
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
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-48 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-sm">
              Всё
            </SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t.v} value={t.v} className="text-sm">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          с{" "}
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-44 text-sm"
          />
          по{" "}
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-44 text-sm"
          />
        </label>
      </FilterBar>
      <HistoryFeed
        showObject={objectId === ALL}
        filter={{
          ...(objectId !== ALL ? { objectId } : {}),
          ...(type !== ALL ? { entityType: type } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }}
      />
    </div>
  );
}
