import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownRight, MessageSquare, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { renderMentionBody } from "@/components/chat/mention";
import { useActiveProfiles } from "@/components/objects/data";
import { NOTIFICATIONS_KEY } from "@/components/notifications/data";

type Comment = {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  parent_id: string | null;
  mention_profile_id: string | null;
  author_name: string | null;
  mention_name: string | null;
};

/** Запрос переписки — общий для блока и счётчика на вкладке (правка 2.12). */
export function commentsQuery(requestId: string) {
  return {
    queryKey: ["request-comments", requestId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from("request_comments")
        .select("id, text, created_at, author_id, parent_id, mention_profile_id")
        .eq("request_id", requestId)
        .order("created_at");
      if (error) throw error;
      const rows = data ?? [];
      const ids = [
        ...new Set(
          rows.flatMap((r) =>
            [r.author_id, r.mention_profile_id].filter((x): x is string => !!x),
          ),
        ),
      ];
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        if (pErr) throw pErr;
        for (const p of profiles ?? []) {
          nameById.set(p.id, p.full_name || "—");
        }
      }
      return rows.map((r) => ({
        id: r.id,
        text: r.text,
        created_at: r.created_at,
        author_id: r.author_id as string,
        parent_id: r.parent_id,
        mention_profile_id: r.mention_profile_id,
        author_name: nameById.get(r.author_id as string) ?? null,
        mention_name: r.mention_profile_id
          ? nameById.get(r.mention_profile_id) ?? null
          : null,
      }));
    },
  };
}

/** Переписка по заявке: ответы и @теги — как на этапах. */
export function RequestComments({ requestId }: { requestId: string }) {
  const me = useProfile();
  const qc = useQueryClient();
  const key = ["request-comments", requestId];
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data = [], isLoading } = useQuery(commentsQuery(requestId));
  const { data: profiles = [] } = useActiveProfiles();
  const byId = useMemo(() => new Map(data.map((c) => [c.id, c])), [data]);

  const send = useMutation({
    mutationFn: async ({ text, mentionId }: { text: string; mentionId: string | null }) => {
      const { error } = await supabase.rpc("request_comment_post", {
        p_request_id: requestId,
        p_text: text,
        p_parent_id: replyTo?.id ?? null,
        p_mention_profile_id: mentionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyTo(null);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
    onError: showError,
  });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [data.length]);

  if (isLoading) {
    return (
      <section className="flex min-h-[28rem] flex-col gap-3 overflow-hidden rounded-md border border-border bg-card p-4">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </section>
    );
  }

  return (
    <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-md border border-border bg-card">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight">Сообщения</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ответы и @теги — как в переписке этапов
        </p>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {data.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MessageSquare className="size-5 opacity-60" />
            <p>Сообщений пока нет</p>
            <p className="text-xs">Напишите коллегам или тегните @ФИО</p>
          </div>
        ) : (
          data.map((c) => {
            const mine = c.author_id === me.id;
            const parent = c.parent_id ? byId.get(c.parent_id) : null;
            return (
              <div
                key={c.id}
                className={cn("flex w-full gap-1", mine ? "justify-end" : "justify-start")}
              >
                {!mine ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="size-7 shrink-0 self-center px-0 text-muted-foreground opacity-60 hover:opacity-100"
                        title="Действия"
                        aria-label="Действия"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem onSelect={() => setReplyTo(c)}>
                        <CornerDownRight className="size-3.5" />
                        Ответить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <article
                  className={cn(
                    "max-w-[min(100%,22rem)] rounded-2xl border px-3 py-2 shadow-sm sm:max-w-[28rem]",
                    mine
                      ? "rounded-br-md border-primary/25 bg-primary/10"
                      : "rounded-bl-md border-border/70 bg-muted/35",
                  )}
                >
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground",
                      mine && "justify-end",
                    )}
                  >
                    {!mine ? (
                      <span className="font-medium text-foreground">{c.author_name || "—"}</span>
                    ) : (
                      <span className="font-medium text-primary">Вы</span>
                    )}
                    <span className="tabular-nums">{formatDateTime(c.created_at)}</span>
                  </div>
                  {parent ? (
                    <div className="mt-1 rounded-md border border-border/50 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {parent.author_name || "—"}:
                      </span>{" "}
                      <span className="line-clamp-2">{parent.text}</span>
                    </div>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">
                    {renderMentionBody(c.text, c.mention_name)}
                  </p>
                </article>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <ChatComposer
          profiles={profiles}
          meId={me.id}
          pending={send.isPending}
          replyTo={
            replyTo
              ? {
                  authorName: replyTo.author_name || "—",
                  body: replyTo.text,
                }
              : null
          }
          onClearReply={() => setReplyTo(null)}
          onSubmit={(payload) => send.mutateAsync(payload)}
        />
      </div>
    </section>
  );
}
