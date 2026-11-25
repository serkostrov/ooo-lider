import { describe, expect, it } from "vitest";
import { buildLabIntegralFillInput, labIntegralPreviewRows } from "./labIntegral";

describe("buildLabIntegralFillInput", () => {
  it("собирает табличный бланк", () => {
    const input = buildLabIntegralFillInput({
      requestNumber: 48,
      callDate: "2026-07-01",
      values: [
        { label: "Пикеты (от – до)", value: "ПК 0+00 – ПК 2+00" },
        { label: "Время вызова", value: "10:00" },
        { label: "Метод контроля", value: "Радиографический" },
        {
          label: "Условия / виды работ",
          value: "Просим произвести просвет стыков с получением результатов на месте",
        },
        { label: "Ответственный за производство работ", value: "Даур 8-926-677-01-80" },
      ],
      fields: [],
      objectCtx: { name: "Объект А", address: "Сиреневый бульвар" },
    });
    expect(input.callTime).toBe("10-00");
    expect(input.recipient).toContain("Интеграл");
    expect(input.projectReg).toBe("");
    expect(labIntegralPreviewRows(input).some((r) => r.label.startsWith("7."))).toBe(true);
    expect(labIntegralPreviewRows(input).some((r) => r.label.startsWith("10."))).toBe(true);
  });
});
