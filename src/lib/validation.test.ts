import { describe, expect, it } from "vitest";
import {
  digitsOnlyOrNull,
  isOptionalEmail,
  isOptionalInn,
  isOptionalKpp,
  isOptionalOgrn,
  isOptionalPhone,
  isValidEmail,
  looksLikeEmailField,
  normalizePhone,
} from "./validation";

describe("email", () => {
  it("принимает корректный адрес", () => {
    expect(isValidEmail("name@company.ru")).toBe(true);
    expect(isOptionalEmail("  a@b.co  ")).toBe(true);
  });

  it("отклоняет мусор и пустое для isValidEmail", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("не почта")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });

  it("пустое для optional — ок", () => {
    expect(isOptionalEmail("")).toBe(true);
    expect(isOptionalEmail("   ")).toBe(true);
  });

  it("looksLikeEmailField по подписи", () => {
    expect(looksLikeEmailField({ label: "Адрес отправки (email)", field_type: "text" })).toBe(true);
    expect(looksLikeEmailField({ label: "Электронная почта", field_type: "text" })).toBe(true);
    expect(looksLikeEmailField({ label: "Адрес объекта", field_type: "text" })).toBe(false);
    expect(looksLikeEmailField({ label: "Email", field_type: "textarea" })).toBe(false);
  });
});

describe("phone", () => {
  it("валидирует российский номер", () => {
    expect(isOptionalPhone("+7 (999) 123-45-67")).toBe(true);
    expect(isOptionalPhone("89991234567")).toBe(true);
    expect(isOptionalPhone("")).toBe(true);
    expect(isOptionalPhone("123")).toBe(false);
  });

  it("нормализует в E.164", () => {
    expect(normalizePhone("+7 (999) 123-45-67")).toBe("+79991234567");
    expect(normalizePhone("")).toBeNull();
  });
});

describe("inn/kpp/ogrn", () => {
  it("ИНН 10 или 12 цифр", () => {
    expect(isOptionalInn("")).toBe(true);
    expect(isOptionalInn("7707083893")).toBe(true);
    expect(isOptionalInn("500100732259")).toBe(true);
    expect(isOptionalInn("123")).toBe(false);
  });

  it("КПП 9 цифр", () => {
    expect(isOptionalKpp("773601001")).toBe(true);
    expect(isOptionalKpp("123")).toBe(false);
  });

  it("ОГРН 13 или 15", () => {
    expect(isOptionalOgrn("1027700132195")).toBe(true);
    expect(isOptionalOgrn("304500116000157")).toBe(true);
    expect(isOptionalOgrn("123")).toBe(false);
  });

  it("digitsOnlyOrNull чистит мусор", () => {
    expect(digitsOnlyOrNull("77-07")).toBe("7707");
    expect(digitsOnlyOrNull("  ")).toBeNull();
  });
});
