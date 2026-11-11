import { describe, expect, it } from "vitest";
import { isEmptyValue } from "./FieldInput";

describe("isEmptyValue", () => {
  it("пустое", () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue("")).toBe(true);
    expect(isEmptyValue(Number.NaN)).toBe(true);
  });

  it("заполненное", () => {
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue("x")).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
  });
});
