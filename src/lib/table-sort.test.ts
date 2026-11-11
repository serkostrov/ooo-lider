import { describe, expect, it } from "vitest";
import { compareValues, sortRows } from "./table-sort";

describe("compareValues", () => {
  it("числа и текст", () => {
    expect(compareValues(1, 2)).toBeLessThan(0);
    expect(compareValues("б", "а")).toBeGreaterThan(0);
    expect(compareValues(null, "x")).toBe(1);
  });
});

describe("sortRows", () => {
  const rows = [
    { name: "Бета", days: 2 },
    { name: "Альфа", days: 10 },
  ];
  const getters = {
    name: (r: (typeof rows)[0]) => r.name,
    days: (r: (typeof rows)[0]) => r.days,
  };

  it("без sort не меняет порядок", () => {
    expect(sortRows(rows, null, getters)).toEqual(rows);
  });

  it("сортирует по полю", () => {
    expect(sortRows(rows, { key: "days", dir: "desc" }, getters).map((r) => r.days)).toEqual([10, 2]);
    expect(sortRows(rows, { key: "name", dir: "asc" }, getters).map((r) => r.name)).toEqual([
      "Альфа",
      "Бета",
    ]);
  });
});
