import { formatDate } from "@/lib/format";
import { valueOrDefault } from "./technadzor";

export type GeotrestObjectCtx = {
  name: string;
  address: string;
  projectNumber: string;
};

export type GeotrestFillInput = {
  /** Строка пункта 1 целиком после двоеточия, напр. «КГС на 22.09.2026». */
  callLine: string;
  objectLine: string;
  volume: string;
  address: string;
  responsible: string;
  /** Полный текст сообщения (правка в превью). */
  messageOverride?: string | null;
};

export function buildGeotrestFillInput(args: {
  callDate: string;
  values: { label: string; value: unknown }[];
  fields: { label: string; default_value: unknown }[];
  objectCtx: GeotrestObjectCtx;
}): GeotrestFillInput {
  const callKind = valueOrDefault(args.values, args.fields, "Вид вызова");
  const volume = valueOrDefault(args.values, args.fields, "Коммуникация и объём");
  const addressField = valueOrDefault(args.values, args.fields, "Точный адрес для вызова");
  const responsible = valueOrDefault(
    args.values,
    args.fields,
    "Ответственный на объекте",
  );
  const objectOverride = valueOrDefault(
    args.values,
    args.fields,
    "Шифр и наименование объекта",
  );

  if (!args.callDate.trim()) throw new Error("Укажите дату вызова");
  if (!volume.trim()) throw new Error("Укажите «Коммуникация и объём»");
  if (!responsible.trim()) throw new Error("Укажите ответственного на объекте");

  const dateRu = formatDate(args.callDate);
  const kind = callKind.trim() || "КГС";
  const objectLine =
    objectOverride.trim() ||
    [args.objectCtx.projectNumber.trim(), args.objectCtx.name.trim()].filter(Boolean).join(" ");

  if (!objectLine.trim()) throw new Error("Укажите шифр и наименование объекта");

  const address = addressField.trim() || args.objectCtx.address.trim();
  if (!address) throw new Error("Укажите точный адрес для вызова");

  return {
    callLine: `${kind} на ${dateRu}`,
    objectLine,
    volume: volume.trim(),
    address,
    responsible: responsible.trim(),
  };
}

export function geotrestMessageBody(input: GeotrestFillInput): string {
  if (input.messageOverride != null && input.messageOverride.trim() !== "") {
    return input.messageOverride.trim();
  }
  return [
    `1. Дата, на которую нужно вызвать (направлять за 2 дня до вызова): ${input.callLine}`,
    `2. Шифр и полное наименование объекта: ${input.objectLine}`,
    `3. Коммуникация и объем (который нужно отснять): ${input.volume}`,
    `4. Точный адрес для вызова: ${input.address}`,
    `5. Ответственный на объекте и его номер: ${input.responsible}`,
  ].join("\n");
}

export function geotrestRebuildMessage(input: GeotrestFillInput): GeotrestFillInput {
  return { ...input, messageOverride: null };
}

export function geotrestPreviewRows(input: GeotrestFillInput): { label: string; value: string }[] {
  return [
    { label: "1. Дата вызова", value: input.callLine },
    { label: "2. Объект", value: input.objectLine },
    { label: "3. Коммуникация и объём", value: input.volume },
    { label: "4. Адрес", value: input.address },
    { label: "5. Ответственный", value: input.responsible },
  ];
}
