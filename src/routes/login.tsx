import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/directories/common";
import { showError } from "@/lib/format";
import { BrandMark } from "@/components/BrandMark";
import { AUTH_BYPASS } from "@/lib/auth-bypass";
import { homeRouteForCurrentUser } from "@/lib/home-route";
import { requestPasswordReset } from "@/lib/admin-user-access";

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
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotDone, setForgotDone] = useState(false);

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
    const home = await homeRouteForCurrentUser();
    navigate({ to: home, replace: true });
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) {
      toast.error("Укажите email");
      return;
    }
    setBusy(true);
    try {
      const result = await requestPasswordReset(mail);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setForgotDone(true);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 overflow-y-auto bg-background lg:grid-cols-[minmax(340px,460px)_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-sidebar-border bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,#286cf240,transparent_55%),radial-gradient(ellipse_at_90%_90%,#26c6da26,transparent_50%)]"
        />
        <div className="relative flex items-center gap-3">
          <BrandMark className="size-10 text-lg" />
          <span className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-sidebar-accent-foreground">
            Лидер
          </span>
        </div>
        <div className="relative">
          <p className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-snug tracking-tight text-sidebar-accent-foreground">
            Этапы, заявки и сроки
            <br />
            по каждому объекту
          </p>
          <p className="mt-3 max-w-xs text-base text-sidebar-foreground/75">
            Видно, у кого сейчас задача, что просрочено и что ждёт ответа.
          </p>
        </div>
        <p className="relative text-sm text-sidebar-foreground/50">ООО «Лидер»</p>
      </aside>
      <main className="flex items-center justify-center bg-background p-4 sm:p-8">
        {mode === "login" ? (
          <form
            onSubmit={onSubmit}
            className="w-full max-w-sm space-y-5 rounded-xl border border-border/70 bg-card p-6 shadow-[var(--surface-glow)] backdrop-blur-[2px] sm:p-8"
          >
            <div className="flex items-center gap-3 lg:hidden">
              <BrandMark className="size-8" />
              <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
                Лидер
              </span>
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em]">
                Вход в систему
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Email и пароль выдаёт администратор
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 bg-elevated pr-10 text-sm"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" disabled={busy} className="h-10 w-full text-sm font-medium">
              {busy ? "Входим…" : "Войти"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                setForgotDone(false);
                setMode("forgot");
              }}
            >
              Забыли пароль?
            </button>
          </form>
        ) : (
          <form
            onSubmit={onForgot}
            className="w-full max-w-sm space-y-5 rounded-xl border border-border/70 bg-card p-6 shadow-[var(--surface-glow)] backdrop-blur-[2px] sm:p-8"
          >
            <div className="flex items-center gap-3 lg:hidden">
              <BrandMark className="size-8" />
              <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
                Лидер
              </span>
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em]">
                Сброс пароля
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Заявка уйдёт администратору. Новый пароль придёт на email после перевыпуска.
              </p>
            </div>
            {forgotDone ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground">
                Если этот email есть в системе, администратор получит заявку и пришлёт новый пароль.
              </p>
            ) : (
              <Field label="Email" required>
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 bg-elevated text-sm"
                />
              </Field>
            )}
            {!forgotDone && (
              <Button type="submit" disabled={busy} className="h-10 w-full text-sm font-medium">
                {busy ? "Отправляем…" : "Отправить заявку"}
              </Button>
            )}
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setMode("login")}
            >
              Назад ко входу
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
