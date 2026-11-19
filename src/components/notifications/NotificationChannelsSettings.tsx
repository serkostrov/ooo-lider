import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const CHANNELS_KEY = ["notification-channels"] as const;

type ChannelsRow = {
  email: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  notify_telegram: boolean;
  notify_email: boolean;
};

function botUsername() {
  return (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, "").trim() ?? "";
}

export function NotificationChannelsSettings() {
  const { id: profileId } = useProfile();
  const qc = useQueryClient();
  const bot = botUsername();

  const q = useQuery({
    queryKey: [...CHANNELS_KEY, profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("email, telegram_chat_id, telegram_username, notify_telegram, notify_email")
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw error;
      return data as ChannelsRow | null;
    },
  });

  const setChannels = useMutation({
    mutationFn: async (p: { telegram?: boolean; email?: boolean }) => {
      const { error } = await supabase.rpc("notification_set_channels", {
        p_telegram: p.telegram ?? null,
        p_email: p.email ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHANNELS_KEY });
      toast.success("Сохранено");
    },
    onError: showError,
  });

  const linkTg = useMutation({
    mutationFn: async () => {
      if (!bot) throw new Error("Не задан VITE_TELEGRAM_BOT_USERNAME в .env");
      const { data, error } = await supabase.rpc("telegram_create_link_code");
      if (error) throw error;
      const code = String(data ?? "");
      if (!code) throw new Error("Не удалось получить код");
      const url = `https://t.me/${bot}?start=${code}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return code;
    },
    onSuccess: () => {
      toast.message("Откройте бота и нажмите Start", {
        description: "После привязки обновите эту страницу",
      });
    },
    onError: showError,
  });

  const unlinkTg = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("telegram_unlink");
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHANNELS_KEY });
      toast.success("Telegram отвязан");
    },
    onError: showError,
  });

  if (q.isLoading) {
    return <Skeleton className="h-48 max-w-xl rounded-xl" />;
  }

  const row = q.data;
  const linked = !!row?.telegram_chat_id;

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--surface-glow)]">
        <h3 className="text-sm font-semibold text-foreground">Telegram</h3>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">
          Нажмите «Привязать» → откроется бот → Start. Уведомления уходят сами (нужен воркер
          рассылки).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {linked ? (
            <>
              <span className="text-sm text-foreground">
                Привязан
                {row?.telegram_username ? ` (@${row.telegram_username})` : ""}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={unlinkTg.isPending}
                onClick={() => unlinkTg.mutate()}
              >
                <Unlink className="mr-1.5 size-3.5" />
                Отвязать
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={linkTg.isPending || !bot}
              onClick={() => linkTg.mutate()}
            >
              <Link2 className="mr-1.5 size-3.5" />
              Привязать Telegram
              <ExternalLink className="ml-1.5 size-3.5 opacity-70" />
            </Button>
          )}
        </div>
        {!bot ? (
          <p className="mt-2 text-xs text-warning">
            В .env добавьте VITE_TELEGRAM_BOT_USERNAME=имя_бота (без @)
          </p>
        ) : null}
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-t border-border/60 pt-4">
          <span className="text-sm text-foreground">Дублировать уведомления в Telegram</span>
          <Switch
            checked={row?.notify_telegram ?? true}
            disabled={setChannels.isPending || !linked}
            onCheckedChange={(on) => setChannels.mutate({ telegram: on })}
          />
        </label>
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--surface-glow)]">
        <h3 className="text-sm font-semibold text-foreground">Email</h3>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">
          Письма уходят на email из карточки сотрудника.
        </p>
        <p className="mt-3 text-sm tabular-nums text-foreground">
          {row?.email?.trim() ? row.email : "Email в профиле не указан — письма слать некуда"}
        </p>
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-t border-border/60 pt-4">
          <span className="text-sm text-foreground">Дублировать уведомления на email</span>
          <Switch
            checked={row?.notify_email ?? true}
            disabled={setChannels.isPending || !row?.email?.trim()}
            onCheckedChange={(on) => setChannels.mutate({ email: on })}
          />
        </label>
      </div>
    </div>
  );
}
