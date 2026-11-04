import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/directories/common";
import { showError } from "@/lib/format";
import { BrandMark } from "@/components/BrandMark";
import { AUTH_BYPASS } from "@/lib/auth-bypass";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (AUTH_BYPASS) throw redirect({ to: "/objects" });
  },
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Вход — Лидер" },
      { name: "description", content: "Вход в систему «Лидер»" },
      { property: "og:title", content: "Вход — Лидер" },
      { property: "og:description", content: "Вход в систему «Лидер»" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      const msg = error.message;
      showError(
        msg === "Invalid login credentials"
          ? { message: "Неверный email или пароль" }
          : msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("fetch")
            ? { message: "Нет связи с сервером. Проверьте, что локальный Supabase запущен (supabase start)." }
            : error,
      );
      return;
    }
    navigate({ to: "/objects", replace: true });
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(340px,460px)_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden p-10 text-sidebar-foreground lg:flex bg-[linear-gradient(165deg,oklch(0.18_0.03_220)_0%,oklch(0.13_0.02_240)_55%,oklch(0.16_0.035_210)_100%)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-24 size-64 rounded-full bg-signal/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-10 size-48 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <BrandMark className="size-10 text-lg" />
          <span className="text-xl font-semibold text-sidebar-primary-foreground">Лидер</span>
        </div>
        <div className="relative">
          <p className="text-2xl font-semibold leading-snug text-sidebar-primary-foreground">
            Этапы, заявки и сроки
            <br />
            по каждому объекту
          </p>
          <p className="mt-3 max-w-xs text-sm text-sidebar-foreground/70">
            Видно, у кого сейчас задача, что просрочено и что ждёт ответа.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-foreground/45">ООО «Лидер»</p>
      </aside>
      <main className="flex items-center justify-center p-4 sm:p-8">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-6 shadow-lg shadow-black/20 animate-in fade-in slide-in-from-bottom-2 duration-300 sm:p-8"
        >
          <div className="flex items-center gap-3 lg:hidden">
            <BrandMark className="size-8" />
            <span className="text-lg font-semibold">Лидер</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Вход в систему</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Логин и пароль выдаёт администратор
            </p>
          </div>
          <Field label="Email" required>
            <Input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 bg-elevated text-sm"
            />
          </Field>
          <Field label="Пароль" required>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 bg-elevated text-sm"
            />
          </Field>
          <Button type="submit" disabled={busy} className="h-10 w-full text-sm font-medium">
            {busy ? "Входим…" : "Войти"}
          </Button>
        </form>
      </main>
    </div>
  );
}
