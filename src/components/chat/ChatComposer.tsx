import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatProfileOption, type ProfileShort } from "@/components/objects/data";
import {
  detectMention,
  highlightComposer,
  type MentionQuery,
} from "@/components/chat/mention";

type ReplyPreview = {
  authorName: string;
  body: string;
  label?: string;
};

type Props = {
  profiles: ProfileShort[];
  meId: string;
  pending?: boolean;
  placeholder?: string;
  replyTo?: ReplyPreview | null;
  onClearReply?: () => void;
  onSubmit: (payload: { text: string; mentionId: string | null }) => void | Promise<void>;
};

/** Общий комposer: ответ + @теги (как в переписке этапов). */
export function ChatComposer({
  profiles,
  meId,
  pending = false,
  placeholder = "Написать сообщение…  @ — тегнуть человека",
  replyTo = null,
  onClearReply,
  onSubmit,
}: Props) {
  const [text, setText] = useState("");
  const [mentionId, setMentionId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const mentionName = useMemo(
    () => (mentionId ? profiles.find((p) => p.id === mentionId)?.full_name ?? null : null),
    [mentionId, profiles],
  );

  const mentionCandidates = useMemo(() => {
    const q = (mentionQuery?.query ?? "").trim().toLowerCase();
    const list = profiles.filter((p) => p.id !== meId);
    if (!q) return list.slice(0, 8);
    return list
      .filter((p) => {
        const hay = `${p.full_name} ${p.role_name ?? ""} ${p.role_code}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [profiles, mentionQuery, meId]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery?.query, mentionCandidates.length]);

  useEffect(() => {
    if (replyTo) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [replyTo]);

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
    if (!mq && mentionId) {
      const p = profiles.find((x) => x.id === mentionId);
      if (!p || !value.includes(`@${p.full_name}`)) setMentionId(null);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || pending) return;
    try {
      await onSubmit({ text: body, mentionId });
      setText("");
      setMentionId(null);
      setMentionQuery(null);
    } catch {
      // ошибку показывает вызывающая сторона
    }
  };

  const showMention = !!mentionQuery && mentionCandidates.length > 0;

  return (
    <div className="relative shrink-0 space-y-2 rounded-md border border-border bg-card p-3">
      {replyTo ? (
        <div className="flex items-start justify-between gap-2 rounded border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs">
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              {replyTo.label ?? "Ответ"} → {replyTo.authorName}
            </div>
            <div className="line-clamp-2 text-muted-foreground">{replyTo.body}</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={onClearReply}
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
          onClick={(e) => onTextChange(e.currentTarget.value, e.currentTarget.selectionStart)}
          onKeyUp={(e) => onTextChange(e.currentTarget.value, e.currentTarget.selectionStart)}
          onScroll={(e) => {
            if (highlightRef.current) {
              highlightRef.current.scrollTop = e.currentTarget.scrollTop;
              highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          rows={2}
          placeholder={placeholder}
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
          Отправить
        </Button>
      </div>
    </div>
  );
}
