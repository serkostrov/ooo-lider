/**
 * Пикеты трассы: «ПК 3+20» = 3 × 100 м + 20 м = 320 м от начала.
 * Значение поля «Пикеты (от – до)» хранится строкой «ПК 3+20 – ПК 4+60»
 * (как вводили раньше вручную), чтобы старые заявки, поиск и Excel не менялись.
 */
export type Picket = { pk: string; m: string };
export type PicketRange = { from: Picket; to: Picket };

export const EMPTY_RANGE: PicketRange = { from: { pk: "", m: "" }, to: { pk: "", m: "" } };

const PK_RE = /ПК\s*(\d+)\s*\+\s*(\d+(?:[.,]\d+)?)/gi;

/** Разбор строки. Понимает «ПК 3+20 – ПК 4+60», «ПК3+20-ПК4+60», одиночный «ПК 0+80». null — не похоже на пикеты. */
export function parsePickets(value: unknown): PicketRange | null {
  if (value === null || value === undefined || value === "") return EMPTY_RANGE;
  if (typeof value !== "string") return null;
  const found = [...value.matchAll(PK_RE)].map((m) => ({ pk: m[1]!, m: m[2]!.replace(",", ".") }));
  if (found.length === 0 || found.length > 2) return null;
  return { from: found[0]!, to: found[1] ?? { pk: "", m: "" } };
}

const metersText = (m: string) => {
  const n = Number(m);
  return Number.isInteger(n) && n < 10 ? `0${n}` : String(n);
};
const pkText = (p: Picket) => `ПК ${Number(p.pk)}+${metersText(p.m || "0")}`;
const filled = (p: Picket) => p.pk !== "";

/** Метры от начала трассы; null — пикет не заполнен. */
export function picketMeters(p: Picket): number | null {
  if (!filled(p)) return null;
  return Number(p.pk) * 100 + Number(p.m || 0);
}

/** Сборка строки. «от» не заполнено → null (поле пустое, сработает проверка обязательности). */
export function formatPickets(r: PicketRange): string | null {
  if (!filled(r.from)) return null;
  return filled(r.to) ? `${pkText(r.from)} – ${pkText(r.to)}` : pkText(r.from);
}

/** Длина участка в метрах; null — если «до» не заполнено. */
export function picketLength(r: PicketRange): number | null {
  const a = picketMeters(r.from);
  const b = picketMeters(r.to);
  return a === null || b === null ? null : Math.round((b - a) * 100) / 100;
}
