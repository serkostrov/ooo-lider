import { describe, expect, it } from "vitest";
import { validateDraft, type ObjectDraft } from "./ObjectCardFields";

const base: ObjectDraft = {
  name: "Объект",
  address: "",
  customer_id: "c1",
  object_type: "uks",
  contract_start: "2026-01-01",
  contract_end: "2026-12-31",
  responsible_id: "",
  curator_contact_id: "",
  technadzor_contact_id: "",
  technadzor_ehz_contact_id: "",
  status: "in_work",
  notes: "",
};

describe("validateDraft", () => {
  it("ok для заполненной карточки", () => {
    expect(validateDraft(base)).toBeNull();
  });

  it("требует название, заказчика, тип и даты", () => {
    expect(validateDraft({ ...base, name: "  " })).toMatch(/название/i);
    expect(validateDraft({ ...base, customer_id: "" })).toMatch(/заказчик/i);
    expect(validateDraft({ ...base, object_type: "" })).toMatch(/тип/i);
    expect(validateDraft({ ...base, contract_end: "" })).toMatch(/дат/i);
  });

  it("конец не раньше начала", () => {
    expect(
      validateDraft({ ...base, contract_start: "2026-06-01", contract_end: "2026-01-01" }),
    ).toMatch(/раньше/i);
  });
});
