import { describe, expect, it } from "vitest";
import { formatPickets, parsePickets, picketLength, picketMeters } from "./pickets";

describe("parsePickets", () => {
  it("разбирает диапазон", () => {
    expect(parsePickets("ПК 3+20 – ПК 4+60")).toEqual({
      from: { pk: "3", m: "20" },
      to: { pk: "4", m: "60" },
    });
  });

  it("одиночный пикет", () => {
    expect(parsePickets("ПК 0+80")).toEqual({
      from: { pk: "0", m: "80" },
      to: { pk: "", m: "" },
    });
  });

  it("пустое → EMPTY_RANGE", () => {
    expect(parsePickets("")).toEqual({ from: { pk: "", m: "" }, to: { pk: "", m: "" } });
  });
});

describe("formatPickets / length", () => {
  it("собирает строку и считает длину", () => {
    const r = { from: { pk: "3", m: "20" }, to: { pk: "4", m: "60" } };
    expect(formatPickets(r)).toBe("ПК 3+20 – ПК 4+60");
    expect(picketLength(r)).toBe(140);
    expect(picketMeters(r.from)).toBe(320);
  });

  it("без «от» → null", () => {
    expect(formatPickets({ from: { pk: "", m: "" }, to: { pk: "1", m: "0" } })).toBeNull();
  });
});
