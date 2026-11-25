import { describe, expect, it } from "vitest";
import {
  buildTechnadzorFillInput,
  fieldValueByLabel,
  formatCallDateTime,
  normalizeCallTime,
  technadzorPreviewRows,
} from "./technadzor";

describe("normalizeCallTime", () => {
  it("нормализует двоеточие и дефис", () => {
    expect(normalizeCallTime("12:00")).toBe("12-00");
    expect(normalizeCallTime("9-30")).toBe("09-30");
    expect(normalizeCallTime(" 13:05 ")).toBe("13-05");
  });
});

describe("formatCallDateTime", () => {
  it("собирает дату и время как в бланке", () => {
    expect(formatCallDateTime("2026-05-25", "12:00")).toBe("25.05.2026 12-00");
  });
});

describe("fieldValueByLabel", () => {
  it("ищет поле без учёта регистра", () => {
    expect(
      fieldValueByLabel(
        [
          { label: "Виды работ", value: "Монтаж" },
          { label: "Примечание", value: null },
        ],
        "виды работ",
      ),
    ).toBe("Монтаж");
  });
});

describe("buildTechnadzorFillInput / preview", () => {
  const objectCtx = {
    address: "Рязанский пр-т",
    projectNumber: "П-1",
    utnNumber: "12",
    utnDate: "2026-01-10" as string | null,
    customer: "Заказчик",
    inspector: "Иванов",
  };

  it("собирает бланк и строки превью", () => {
    const input = buildTechnadzorFillInput({
      callDate: "2026-11-28",
      values: [
        { label: "Время вызова", value: "10:50" },
        { label: "Виды работ", value: "Кровельные работы" },
        { label: "Ответственный за производство работ", value: "Балаев" },
      ],
      fields: [],
      objectCtx,
    });
    expect(input.callTime).toBe("10:50");
    const rows = technadzorPreviewRows(input);
    expect(rows[0]?.value).toBe("28.11.2026 10-50");
    expect(rows.find((r) => r.label === "Виды работ")?.value).toBe("Кровельные работы");
  });

  it("требует обязательные поля бланка", () => {
    expect(() =>
      buildTechnadzorFillInput({
        callDate: "2026-11-28",
        values: [],
        fields: [],
        objectCtx,
      }),
    ).toThrow(/Время вызова/);
  });
});
