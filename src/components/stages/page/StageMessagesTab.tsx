import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CornerDownRight, MessageSquare, MoreHorizontal, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/dates";
import { showError } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NOTIFICATIONS_KEY } from "@/components/notifications/data";
import { formatProfileOption, useActiveProfiles, type ProfileShort } from "@/components/objects/data";
import type { ObjectStage } from "@/components/stages/data";
import {
  detectMention,
  highlightComposer,
  renderMentionBody,
  type MentionQuery,
} from "@/components/chat/mention";

export type StageMessage = {
  id: string;
  stage_id: string;
  object_id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  kind: "chat" | "status_ask" | "status_reply";
  mention_profile_id: string | null;
  status_ask_id: string | null;
  created_at: string;
  author_name: string | null;
  mention_name: string | null;
};

export const stageMessagesKey = (stageId: string) => ["stage-messages", stageId] as const;

export function useStageMessages(stageId: string) {
  return useQuery({
    queryKey: stageMessagesKey(stageId),
    enabled: !!stageId,
    queryFn: async (): Promise<StageMessage[]> => {
      const { data, error } = await supabase
        .from("stage_messages")
        .select(
          "id, stage_id, object_id, author_id, body, parent_id, kind, mention_profile_id, status_ask_id, created_at",
        )
        .eq("stage_id", stageId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      const ids = [
        ...new Set(
          rows.flatMap((r) =>
            [r.author_id as string, r.mention_profile_id as string | null].filter(
              (x): x is string => !!x,
            ),
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
          nameById.set(p.id as string, (p.full_name as string) || "—");
        }
      }
      return rows.map((r) => ({
        id: r.id as string,
        stage_id: r.stage_id as string,
        object_id: r.object_id as string,
        author_id: r.author_id as string,
        body: r.body as string,
        parent_id: (r.parent_id as string | null) ?? null,
        kind: (r.kind as StageMessage["kind"]) ?? "chat",
        mention_profile_id: (r.mention_profile_id as string | null) ?? null,
        status_ask_id: (r.status_ask_id as string | null) ?? null,
        created_at: r.created_at as string,
        author_name: nameById.get(r.author_id as string) ?? null,
        mention_name: r.mention_profile_id
          ? nameById.get(r.mention_profile_id as string) ?? null
          : null,
      }));
    },
  });
}

function kindBadge(kind: StageMessage["kind"]) {
  if (kind === "status_ask") return { label: "Запрос статуса", className: "bg-warning-soft text-warning" };
  if (kind === "status_reply") return { label: "Статус", className: "bg-success-soft text-success" };
  return null;
}

function MessageActions({
  align,
  canStatus,
  onReply,
}: {
  align: "start" | "end";
  canStatus: boolean;
  onReply: () => void;
}) {
  return (
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
      <DropdownMenuContent align={align} className="w-44">
        <DropdownMenuItem onSelect={onReply}>
          <CornerDownRight className="size-3.5" />
          Ответить
        </DropdownMenuItem>
        {canStatus ? (
          <DropdownMenuItem onSelect={onReply}>Предоставить статус</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Переписка этапа: сообщения, ответы, @теги. */
export function StageMessagesTab({ stage }: { stage: ObjectStage }) {
  const me = useProfile();
  const qc = useQueryClient();
  const { data: messages = [], isLoading } = useStageMessages(stage.id);
  const { data: profiles = [] } = useActiveProfiles();
  const { data: canPost = false } = useQuery({
    queryKey: ["can-post-stage-message", stage.id, me.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_post_stage_message", {
        p_stage_id: stage.id,
      });
      if (error) throw error;
      return !!data;
    },
  });
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<StageMessage | null>(null);
  const [mentionId, setMentionId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const mentionName = useMemo(
    () => (mentionId ? profiles.find((p) => p.id === mentionId)?.full_name ?? null : null),
    [mentionId, profiles],
  );

  const mentionCandidates = useMemo(() => {
    const q = (mentionQuery?.query ?? "").trim().toLowerCase();
    const list = profiles.filter((p) => p.id !== me.id);
    if (!q) return list.slice(0, 8);
    return list
      .filter((p) => {
        const hay = `${p.full_name} ${p.role_name ?? ""} ${p.role_code}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [profiles, mentionQuery, me.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery?.query, mentionCandidates.length]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: stageMessagesKey(stage.id) });
    void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    void qc.invalidateQueries({ queryKey: ["history"] });
  };

  const applyMention = (p: ProfileShort) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(textareaRef.current?.selectionStart ?? text.length);
    const rest = after.replace(/^@[^\s]*/, "");
    const next = `${before}@${p.full_name} ${rest}`;
    setText(next);
    setMentionId(p.id);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = before.length + p.full_name.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onTextChange = (value: string, caret: number) => {
    setText(value);
    const mq = detectMention(value, caret);
    setMentionQuery(mq);
    if (!mq) {
      // если стёрли @тег — сбросить mentionId
      if (mentionId) {
        const p = profiles.find((x) => x.id === mentionId);
        if (!p || !value.includes(`@${p.full_name}`)) setMentionId(null);
      }
    }
  };

  const post = useMutation({
    mutationFn: async () => {
      const body = text.trim();
      if (!body) throw new Error("Введите текст");
      const { error } = await supabase.rpc("stage_message_post", {
        p_stage_id: stage.id,
        p_body: body,
        p_parent_id: replyTo?.id ?? null,
        p_mention_profile_id: mentionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      setMentionId(null);
      setMentionQuery(null);
      refresh();
    },
    onError: showError,
  });

  const statusReply = useMutation({
    mutationFn: async ({ askId, body }: { askId: string; body: string }) => {
      const { error } = await supabase.rpc("stage_message_status_reply", {
        p_ask_id: askId,
        p_body: body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      setMentionId(null);
      setMentionQuery(null);
      toast.success("Статус отправлен");
      refresh();
    },
    onError: showError,
  });

  const openAsksForMe = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.kind === "status_ask" &&
          m.status_ask_id &&
          (m.mention_profile_id === me.id || stage.executor_id === me.id) &&
          !messages.some((r) => r.kind === "status_reply" && r.status_ask_id === m.status_ask_id),
      ),
    [messages, me.id, stage.executor_id],
  );

  const send = () => {
    const body = text.trim();
    if (!body) return;
    const ask =
      replyTo?.kind === "status_ask" && replyTo.status_ask_id
        ? replyTo
        : openAsksForMe.length === 1 && !replyTo
          ? openAsksForMe[0]
          : null;
    if (
      ask?.status_ask_id &&
      (ask.mention_profile_id === me.id || stage.executor_id === me.id || me.is_admin)
    ) {
      statusReply.mutate({ askId: ask.status_ask_id, body });
      return;
    }
    post.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    );
  }

  const pending = post.isPending || statusReply.isPending;
  const showMention = !!mentionQuery && mentionCandidates.length > 0;

  return (
    <div className="flex min-h-[22rem] flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto rounded-md border border-border bg-card p-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <MessageSquare className="size-5 opacity-60" />
            <p>Пока нет сообщений</p>
            <p className="text-xs">Напишите коллегам или запросите статус у исполнителя</p>
          </div>
        ) : (
          messages.map((m) => {
            const parent = m.parent_id ? byId.get(m.parent_id) : null;
            const badge = kindBadge(m.kind);
            const mine = m.author_id === me.id;
            const canStatus =
              m.kind === "status_ask" &&
              !!m.status_ask_id &&
              openAsksForMe.some((a) => a.id === m.id);
            return (
              <div
                key={m.id}
                className={cn("flex w-full gap-1", mine ? "justify-end" : "justify-start")}
              >
                {!mine && canPost ? (
                  <MessageActions
                    align="start"
                    canStatus={canStatus}
                    onReply={() => {
                      setReplyTo(m);
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                  />
                ) : null}
                <article
                  className={cn(
                    "max-w-[min(100%,22rem)] rounded-2xl border px-3 py-2 shadow-sm sm:max-w-[28rem]",
                    mine
                      ? "rounded-br-md border-primary/25 bg-primary/10"
                      : "rounded-bl-md border-border/70 bg-muted/35",
                    m.kind === "status_ask" && "border-warning/40 bg-warning-soft/25",
                    m.kind === "status_reply" && "border-success/35 bg-success-soft/20",
                  )}
                >
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground",
                      mine && "justify-end",
                    )}
                  >
                    {!mine ? (
                      <span className="font-medium text-foreground">{m.author_name || "—"}</span>
                    ) : (
                      <span className="font-medium text-primary">Вы</span>
                    )}
                    <span className="tabular-nums">{formatDateTime(m.created_at)}</span>
                    {badge ? (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    ) : null}
                  </div>
                  {parent ? (
                    <div className="mt-1 rounded-md border border-border/50 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {parent.author_name || "—"}:
                      </span>{" "}
                      <span className="line-clamp-2">{parent.body}</span>
                    </div>
                  ) : null}
                  <p
                    className={cn(
                      "mt-1 whitespace-pre-wrap text-sm leading-snug",
                      mine && "text-foreground",
                    )}
                  >
                    {renderMentionBody(m.body, m.mention_name)}
                  </p>
                </article>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {canPost ? (
        <div className="relative shrink-0 space-y-2 rounded-md border border-border bg-card p-3">
          {replyTo ? (
            <div className="flex items-start justify-between gap-2 rounded border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  {replyTo.kind === "status_ask" ? "Ответ со статусом" : "Ответ"} →{" "}
                  {replyTo.author_name || "—"}
                </div>
                <div className="line-clamp-2 text-muted-foreground">{replyTo.body}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => setReplyTo(null)}
              >
                Снять
              </Button>
            </div>
          ) : null}
          {showMention ? (
            <ul className="absolute bottom-[calc(100%-0.25rem)] left-3 right-3 z-20 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
              {mentionCandidates.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm",
                      i === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMention(p);
                    }}
                  >
                    {formatProfileOption(p)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="relative">
            <div
              ref={highlightRef}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent bg-transparent px-3 py-2 text-base leading-normal text-foreground md:text-sm",
                !text && "opacity-0",
              )}
            >
              {highlightComposer(text, mentionName)}
            </div>
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => onTextChange(e.target.value, e.target.selectionStart)}
              onClick={(e) =>
                onTextChange(e.currentTarget.value, e.currentTarget.selectionStart)
              }
              onKeyUp={(e) =>
                onTextChange(e.currentTarget.value, e.currentTarget.selectionStart)
              }
              onScroll={(e) => {
                if (highlightRef.current) {
                  highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                  highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
              rows={2}
              placeholder={
                replyTo?.kind === "status_ask"
                  ? "Кратко опишите текущий статус этапа…"
                  : "Написать сообщение…  @ — тегнуть человека"
              }
              className={cn(
                "relative min-h-[2.75rem] bg-transparent caret-foreground",
                text ? "text-transparent" : undefined,
              )}
              style={
                text
                  ? { WebkitTextFillColor: "transparent", caretColor: "var(--foreground)" }
                  : undefined
              }
              onKeyDown={(e) => {
                if (showMention) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) => Math.min(i + 1, mentionCandidates.length - 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    const p = mentionCandidates[mentionIndex];
                    if (p) applyMention(p);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionQuery(null);
                    return;
                  }
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {mentionId ? "Тег выбран · уведомление уйдёт" : "Ctrl/⌘ + Enter — отправить"}
            </p>
            <Button
              type="button"
              className="h-9 gap-1.5"
              disabled={pending || !text.trim()}
              onClick={send}
            >
              <Send className="size-3.5" />
              {replyTo?.kind === "status_ask" ? "Отправить статус" : "Отправить"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Нет прав писать в переписку этого этапа</p>
      )}
    </div>
  );
}
