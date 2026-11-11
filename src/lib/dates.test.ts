import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "./dates";

describe("daysBetween / addDays", () => {
  it("считает разницу", () => {
    expect(daysBetween("2026-11-01", "2026-11-11")).toBe(10);
    expect(daysBetween("2026-11-11", "2026-11-01")).toBe(-10);
  });

  it("прибавляет дни", () => {
    expect(addDays("2026-11-01", 14)).toBe("2026-11-15");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
