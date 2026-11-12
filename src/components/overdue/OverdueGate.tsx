import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useShowOverdueGate } from "@/lib/ui-settings";
import { formatDay, useOverdueCounts, useOverduePreview, type OverdueItem } from "./data";

/** Показ fullscreen «Просрочено» один раз за сессию входа (ТЗ 7.8). */
const SESSION_KEY = "lider.overdue-gate-ack";

export function clearOverdueGateAck() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode / SSR */
  }
}

function wasAcked() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function ack() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * После входа, если есть просроченные заявки/этапы — окно на весь экран.
 * «Понятно» скрывает до следующего входа (sessionStorage).
 */
export function OverdueGate() {
  const preview = useOverduePreview(80);
  const counts = useOverdueCounts();
  const gatePref = useShowOverdueGate();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const items = preview.data ?? [];
  const total = counts.data?.total ?? items.length;
  const isReady = !!preview.data && !!counts.data;

  const stages = useMemo(
    () => items.filter((i) => i.kind === "stage").sort((a, b) => b.days - a.days),
    [items],
  );
  const requests = useMemo(
    () => items.filter((i) => i.kind === "request").sort((a, b) => b.days - a.days),
    [items],
  );

  const prefReady = gatePref.isSuccess || gatePref.isError;
  const showOnLogin = gatePref.isError || gatePref.data !== false;

  useEffect(() => {
    if (!isReady || !prefReady || wasAcked() || total === 0 || !showOnLogin) return;
    setOpen(true);
  }, [isReady, prefReady, total, showOnLogin]);

  if (!open || total === 0) return null;

  const dismiss = () => {
    ack();
    setOpen(false);
  };

  const openItem = (it: OverdueItem) => {
    ack();
    setOpen(false);
    if (it.kind === "request") {
      void navigate({ to: "/requests/$requestId", params: { requestId: it.id } });
    } else {
      void navigate({
        to: "/objects/$id/stages/$stageId",
        params: { id: it.objectId, stageId: it.id },
      });
    }
  };

  const stagesTotal = counts.data?.stages ?? stages.length;
  const requestsTotal = counts.data?.requests ?? requests.length;
  const summaryParts = [
    stagesTotal > 0 ? `${stagesTotal} ${stagesWord(stagesTotal)}` : null,
    requestsTotal > 0 ? `${requestsTotal} ${requestsWord(requestsTotal)}` : null,
  ].filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="overdue-gate-title"
      className="fixed inset-0 z-[100] flex h-dvh flex-col overflow-hidden bg-background"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex shrink-0 items-start gap-3 sm:mb-6">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-danger text-danger-foreground">
            <AlertTriangle className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 id="overdue-gate-title" className="text-2xl font-semibold tracking-tight">
              Просрочено · {total}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {summaryParts.join(" · ")}. Закройте или перенесите — иначе список будет гореть при
              каждом входе.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain rounded-md border border-border bg-card p-2 sm:p-3">
          {stages.length > 0 && (
            <OverdueSection
              icon={Layers}
              title="Этапы"
              count={stagesTotal}
              items={stages}
              onOpen={openItem}
            />
          )}
          {requests.length > 0 && (
            <OverdueSection
              icon={ClipboardList}
              title="Заявки"
              count={requestsTotal}
              items={requests}
              onOpen={openItem}
            />
          )}
          {items.length < total && (
            <p className="px-2 pb-1 text-center text-xs text-muted-foreground">
              Показаны самые просроченные · остальное — в разделе «Просрочено»
            </p>
          )}
        </div>

        <div className="mt-4 flex shrink-0 justify-end sm:mt-6">
          <Button type="button" className="h-11 min-w-[10rem] px-6 text-base" onClick={dismiss}>
            Понятно
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverdueSection({
  icon: Icon,
  title,
  count,
  items,
  onOpen,
}: {
  icon: typeof Layers;
  title: string;
  count: number;
  items: OverdueItem[];
  onOpen: (it: OverdueItem) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1.5 pt-0.5">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-danger-soft text-danger">
          <Icon className="size-3.5" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-[family-name:var(--font-display)] text-xs font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it.key}
            className={cn(
              "flex flex-col gap-3 rounded-lg border border-transparent px-3 py-3",
              "hover:border-border hover:bg-muted/40 sm:flex-row sm:items-center",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug">{it.title}</div>
              <div className="mt-0.5 truncate text-sm text-muted-foreground">{it.objectName}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Срок {formatDay(it.dueDate)}
                <span className="ml-2 font-semibold text-danger">−{it.days} дн.</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 px-4 text-sm"
              onClick={() => onOpen(it)}
            >
              Открыть
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function stagesWord(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "этап";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "этапа";
  return "этапов";
}

function requestsWord(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заявка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заявки";
  return "заявок";
}
