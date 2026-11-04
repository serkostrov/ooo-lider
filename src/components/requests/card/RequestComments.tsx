import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Comment = { id: string; text: string; created_at: string; author: { full_name: string } | null };

/** Запрос переписки — общий для блока и счётчика на вкладке (правка 2.12). */
export function commentsQuery(requestId: string) {
  return {
    queryKey: ["request-comments", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_comments")
        .select("id, text, created_at, author:profiles!request_comments_author_id_fkey(full_name)")
        .eq("request_id", requestId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  };
}

/** Переписка по заявке: «технадзор связался, они на связи» и т. п. (ТЗ 7.7). */
export function RequestComments({ requestId }: { requestId: string }) {
  const me = useProfile();
  const qc = useQueryClient();
  const key = ["request-comments", requestId];
  const [text, setText] = useState("");
  const { data = [] } = useQuery(commentsQuery(requestId));
  const send = useMutation({
    mutationFn: async () => {
      const t = text.trim();
      if (!t) throw new Error("Напишите сообщение");
      const { error } = await supabase.from("request_comments").insert({ request_id: requestId, author_id: me.id, text: t });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: showError,
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-4 text-lg font-semibold">Переписка</h2>
      {data.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">Сообщений пока нет</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {data.map((c) => (
            <li key={c.id} className="rounded-xl bg-muted/60 px-4 py-2">
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{c.author?.full_name ?? "Сотрудник"}</span>
                <span className="ml-2">{formatDateTime(c.created_at)}</span>
              </div>
              <div className="mt-1 whitespace-pre-line text-sm">{c.text}</div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: технадзор связался, они на связи"
          rows={2}
          className="min-w-64 flex-1 text-sm"
        />
        <Button type="submit" disabled={send.isPending} className="h-auto min-h-9 self-stretch px-4 text-sm">
          <Send className="size-4" /> Отправить
        </Button>
      </form>
    </section>
  );
}
