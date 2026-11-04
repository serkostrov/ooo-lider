import { toast } from "sonner";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** ДД.ММ.ГГГГ в часовом поясе Europe/Moscow. Строки вида YYYY-MM-DD выводятся как есть. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  return dateFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** Показать ошибку RPC текстом исключения. */
export function showError(error: unknown) {
  const msg =
    (error && typeof error === "object" && "message" in error && String((error as { message: unknown }).message)) ||
    "Произошла ошибка";
  toast.error(String(msg));
}
