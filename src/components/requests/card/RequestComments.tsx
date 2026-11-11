import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Comment = {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  author: { full_name: string } | null;
};

/** Запрос переписки — общий для блока и счётчика на вкладке (правка 2.12). */
export function commentsQuery(requestId: string) {
  return {
    queryKey: ["request-comments", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_comments")
        .select("id, text, created_at, author_id, author:profiles!request_comments_author_id_fkey(full_name)")
        .eq("request_id", requestId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

/** Переписка по заявке: «технадзор связался, они на связи» и т. п. (ТЗ 7.7). */
export function RequestComments({ requestId }: { requestId: string }) {
  const me = useProfile();
  const qc = useQueryClient();
  const key = ["request-comments", requestId];
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const { data = [] } = useQuery(commentsQuery(requestId));
  const send = useMutation({
    mutationFn: async () => {
      const t = text.trim();
      if (!t) throw new Error("Напишите сообщение");
      const { error } = await supabase
        .from("request_comments")
        .insert({ request_id: requestId, author_id: me.id, text: t });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: showError,
  });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [data.length]);

  return (
    <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-md border border-border bg-card">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight">Переписка</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Короткие заметки по выезду — видно всем участникам заявки
        </p>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {data.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm text-muted-foreground">Сообщений пока нет</p>
            <p className="text-xs text-muted-foreground/80">Напишите, если технадзор на связи или есть уточнения</p>
          </div>
        ) : (
          data.map((c) => {
            const mine = c.author_id === me.id;
            const name = c.author?.full_name ?? "Сотрудник";
            return (
              <div
                key={c.id}
                className={cn("flex gap-2.5", mine ? "flex-row-reverse" : "flex-row")}
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                    mine ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {initials(name)}
                </div>
                <div className={cn("max-w-[min(100%,28rem)] min-w-0", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
                    <span className="font-medium text-foreground/90">{mine ? "Вы" : name}</span>
                    <time className="text-muted-foreground" dateTime={c.created_at}>
                      {formatDateTime(c.created_at)}
                    </time>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line",
                      mine
                        ? "rounded-tr-md bg-primary/15 text-foreground"
                        : "rounded-tl-md bg-muted/70 text-foreground",
                    )}
                  >
                    {c.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        className="shrink-0 border-t border-border bg-muted/20 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Например: технадзор связался, они на связи"
            rows={2}
            className="min-h-[2.75rem] flex-1 resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!send.isPending && text.trim()) send.mutate();
              }
            }}
          />
          <Button
            type="submit"
            disabled={send.isPending || !text.trim()}
            className="h-10 shrink-0 gap-1.5 px-3 text-sm"
            title="Отправить · Enter"
          >
            <Send className="size-4" />
            <span className="hidden sm:inline">Отправить</span>
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Enter — отправить, Shift+Enter — новая строка</p>
      </form>
    </section>
  );
}
