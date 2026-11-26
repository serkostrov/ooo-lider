import { describe, expect, it } from "vitest";
import {
  buildLabMosgazFillInput,
  formatLongRuDate,
  labMosgazLetterBody,
  labMosgazPreviewRows,
  parseLetterDateYmd,
} from "./labMosgaz";

describe("formatLongRuDate", () => {
  it("форматирует длинную дату", () => {
    expect(formatLongRuDate("2026-07-01")).toBe("01 июля 2026 года");
  });
});

describe("parseLetterDateYmd", () => {
  it("принимает YYYY-MM-DD и ДД.ММ.ГГГГ", () => {
    expect(parseLetterDateYmd("2025-11-13")).toBe("2025-11-13");
    expect(parseLetterDateYmd("13.11.2025")).toBe("2025-11-13");
    expect(parseLetterDateYmd("")).toBeNull();
  });
});

describe("buildLabMosgazFillInput", () => {
  const objectCtx = {
    name: "Вынос газопровода",
    address: "г. Москва, Сиреневый бульвар вл.70",
    projectNumber: "МГ-3161-с/24",
  };

  it("собирает факсограмму", () => {
    const input = buildLabMosgazFillInput({
      requestNumber: 37,
      callDate: "2026-07-01",
      values: [
        { label: "Пикеты (от – до)", value: "ПК 0+00 – ПК 2+66" },
        { label: "Время вызова", value: "13:00" },
        { label: "Виды работ", value: "продувку Ду 110х10,0 мм трубы, низкого давления" },
        { label: "Ответственный за производство работ", value: "Павел 8-926-267-91-18" },
      ],
      fields: [],
      objectCtx,
    });
    expect(input.outNumber).toBe("");
    expect(input.callTime).toBe("13-00");
    const body = labMosgazLetterBody(input);
    expect(body).toMatch(/продувку/);
    expect(body).toMatch(/Сиреневый бульвар/);
    expect(labMosgazPreviewRows(input)[0]?.value).toBe("");
  });

  it("требует пикеты и время", () => {
    expect(() =>
      buildLabMosgazFillInput({
        requestNumber: 1,
        callDate: "2026-07-01",
        values: [],
        fields: [],
        objectCtx,
      }),
    ).toThrow(/Пикеты/);
  });
});
