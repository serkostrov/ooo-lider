import { describe, expect, it } from "vitest";
import {
  ACTION_KINDS,
  CONDITION_KINDS,
  CONTACT_POSITIONS,
  DOC_SECTIONS,
  FIELD_TYPES,
  FILLED_BY,
  SYSTEM_STAGE_STATUSES,
  docTitleFromFile,
  emptyToNull,
  escapeIlike,
  isHexColor,
  isSystemStageStatus,
  matches,
  moveItem,
  nextSort,
  normalizeDirectoryName,
  parseFieldOptions,
  slugCode,
  toIntOrNull,
  uniqueCode,
  validateCustomer,
  validateCustomerContact,
  validateDocument,
  validateEmployee,
  validateNamedDirectoryItem,
  validateRepresentative,
  validateRequestField,
  validateRequestStatus,
  validateRequestType,
  validateRole,
  validateStageStatus,
  validateStageTemplate,
} from "./rules";

describe("справочники: общие хелперы", () => {
  it("matches ищет без регистра", () => {
    expect(matches("", "Альфа")).toBe(true);
    expect(matches("аль", "Альфа")).toBe(true);
    expect(matches("бета", "Альфа", null)).toBe(false);
  });

  it("emptyToNull / isHexColor / toIntOrNull", () => {
    expect(emptyToNull("  ")).toBeNull();
    expect(emptyToNull(" x ")).toBe("x");
    expect(isHexColor("#AbCdEf")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(toIntOrNull("")).toBeNull();
    expect(toIntOrNull("12")).toBe(12);
    expect(toIntOrNull("1.5")).toBe("bad");
    expect(toIntOrNull("-1")).toBe("bad");
  });

  it("slugCode и uniqueCode", () => {
    expect(slugCode("Инженер ПТО", "role")).toBe("inzhener_pto");
    expect(slugCode("!!!", "status")).toBe("status");
    expect(uniqueCode("role", ["role", "role_2"])).toBe("role_3");
    expect(uniqueCode("fresh", ["other"])).toBe("fresh");
  });

  it("nextSort / moveItem / normalize / escapeIlike", () => {
    expect(nextSort([{ sort: 1 }, { sort: 5 }])).toBe(6);
    expect(nextSort([])).toBe(1);
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a"], 0, 1)).toBeNull();
    expect(normalizeDirectoryName("  А  Б  ")).toBe("А Б");
    expect(escapeIlike("100%_x")).toBe("100\\%\\_x");
  });

  it("docTitleFromFile и parseFieldOptions", () => {
    expect(docTitleFromFile("Акт.pdf")).toBe("Акт");
    expect(docTitleFromFile("без_точки")).toBe("без_точки");
    expect(parseFieldOptions(" а \n\nб\n")).toEqual(["а", "б"]);
  });
});

describe("каталоги констант справочников", () => {
  it("разделы документов", () => {
    expect(DOC_SECTIONS).toContain("ГСН");
    expect(DOC_SECTIONS).toContain("МосГаз");
    expect(DOC_SECTIONS).toHaveLength(5);
  });

  it("должности контактов заказчика", () => {
    expect(CONTACT_POSITIONS).toEqual(
      expect.arrayContaining(["Куратор", "Технадзор", "ГИП"]),
    );
  });

  it("поля заявок и кто заполняет", () => {
    expect(FIELD_TYPES.map((t) => t.v)).toEqual(
      expect.arrayContaining(["text", "select", "picket_range", "file"]),
    );
    expect(FILLED_BY.map((t) => t.v)).toEqual(["initiator", "office"]);
  });

  it("условия и действия этапа", () => {
    expect(CONDITION_KINDS.map((k) => k.v)).toEqual(["check", "file", "field"]);
    expect(ACTION_KINDS.map((k) => k.v)).toEqual(
      expect.arrayContaining(["fill", "send", "confirm"]),
    );
  });

  it("системные статусы этапа нельзя считать обычными", () => {
    expect(SYSTEM_STAGE_STATUSES.size).toBe(7);
    expect(isSystemStageStatus("on_review")).toBe(true);
    expect(isSystemStageStatus("custom")).toBe(false);
  });
});

describe("Заказчики", () => {
  it("требует название и валидные реквизиты", () => {
    expect(validateCustomer({ name: "", inn: "", kpp: "", ogrn: "" })).toMatch(/название/i);
    expect(validateCustomer({ name: "ООО", inn: "123", kpp: "", ogrn: "" })).toMatch(/ИНН/);
    expect(validateCustomer({ name: "ООО", inn: "7707083893", kpp: "12", ogrn: "" })).toMatch(/КПП/);
    expect(
      validateCustomer({ name: "ООО", inn: "7707083893", kpp: "773601001", ogrn: "1027700132195" }),
    ).toBeNull();
  });
});

describe("Контакты заказчика", () => {
  it("ФИО + телефон/email", () => {
    expect(validateCustomerContact({ full_name: "", phone: "", email: "" })).toMatch(/ФИО/);
    expect(
      validateCustomerContact({ full_name: "Иван", phone: "123", email: "" }),
    ).toMatch(/телефон/i);
    expect(
      validateCustomerContact({ full_name: "Иван", phone: "", email: "bad" }),
    ).toMatch(/email/i);
    expect(
      validateCustomerContact({
        full_name: "Иван",
        phone: "+7 (999) 123-45-67",
        email: "a@b.ru",
      }),
    ).toBeNull();
  });
});

describe("Сотрудники", () => {
  it("ФИО и роль обязательны", () => {
    expect(validateEmployee({ full_name: "", role_code: "", phone: "", email: "" })).toMatch(/ФИО и роль/);
    expect(
      validateEmployee({ full_name: "Петр", role_code: "foreman", phone: "", email: "" }),
    ).toBeNull();
  });
});

describe("Представители", () => {
  it("название обязательно", () => {
    expect(validateRepresentative({ name: "  ", phone: "", email: "" })).toMatch(/название/);
    expect(validateRepresentative({ name: "ООО Выезд", phone: "", email: "" })).toBeNull();
  });
});

describe("Документы", () => {
  it("название и раздел из списка", () => {
    expect(validateDocument({ name: "", section: "" })).toMatch(/название и раздел/);
    expect(validateDocument({ name: "Акт", section: "Неизвестно" })).toMatch(/раздел/);
    expect(validateDocument({ name: "Акт", section: "ГСН" })).toBeNull();
  });
});

describe("Группы / типы объектов", () => {
  it("только непустое название", () => {
    expect(validateNamedDirectoryItem("   ")).toMatch(/название/);
    expect(validateNamedDirectoryItem("  Земляные  ")).toBeNull();
  });
});

describe("Роли", () => {
  it("название обязательно", () => {
    expect(validateRole("")).toMatch(/название/);
    expect(validateRole("Прораб")).toBeNull();
  });
});

describe("Статусы этапа", () => {
  it("название и #RRGGBB", () => {
    expect(validateStageStatus({ name: "", color: "#112233" })).toMatch(/название/);
    expect(validateStageStatus({ name: "Новый", color: "red" })).toMatch(/#RRGGBB/);
    expect(validateStageStatus({ name: "Новый", color: "#112233" })).toBeNull();
  });
});

describe("Статусы заявки", () => {
  it("кнопка обязательна не на первом шаге", () => {
    expect(validateRequestStatus({ name: "Новая", action: "", color: "#112233", first: true })).toBeNull();
    expect(
      validateRequestStatus({ name: "В работе", action: "", color: "#112233", first: false }),
    ).toMatch(/кнопки/);
    expect(
      validateRequestStatus({ name: "В работе", action: "Взять", color: "#112233", first: false }),
    ).toBeNull();
  });
});

describe("Виды заявок", () => {
  it("название и email", () => {
    expect(validateRequestType({ name: "", send_to_email: "" })).toMatch(/назван/);
    expect(validateRequestType({ name: "Вызов", send_to_email: "x" })).toMatch(/email/i);
    expect(validateRequestType({ name: "Вызов", send_to_email: "a@b.ru" })).toBeNull();
  });
});

describe("Поля вида заявки", () => {
  it("select без вариантов — ошибка", () => {
    expect(validateRequestField({ label: "", field_type: "text", optionsText: "" })).toMatch(/подпись/);
    expect(validateRequestField({ label: "Тип", field_type: "select", optionsText: "" })).toMatch(
      /варианты/,
    );
    expect(
      validateRequestField({ label: "Тип", field_type: "select", optionsText: "А\nБ" }),
    ).toBeNull();
    expect(validateRequestField({ label: "X", field_type: "weird", optionsText: "" })).toMatch(
      /тип поля/,
    );
  });
});

describe("Шаблоны этапов", () => {
  const base = {
    number: "10",
    name: "Засыпка",
    workTypeId: "wt-1",
    duration: "5",
    responseDays: "",
    remindDays: "2",
    existing: [{ id: "a", number: 1 }],
    currentId: null as string | null,
  };

  it("номер, группа, уникальность", () => {
    expect(validateStageTemplate({ ...base, number: "0" })).toMatch(/больше 0/);
    expect(validateStageTemplate({ ...base, number: "x" })).toMatch(/больше 0/);
    expect(validateStageTemplate({ ...base, name: "" })).toMatch(/название/);
    expect(validateStageTemplate({ ...base, workTypeId: "" })).toMatch(/группу/);
    expect(validateStageTemplate({ ...base, duration: "1.5" })).toMatch(/Сроки/);
    expect(
      validateStageTemplate({
        ...base,
        number: "1",
        existing: [{ id: "a", number: 1 }],
        currentId: null,
      }),
    ).toMatch(/уже есть/);
    expect(
      validateStageTemplate({
        ...base,
        number: "1",
        existing: [{ id: "a", number: 1 }],
        currentId: "a",
      }),
    ).toBeNull();
    expect(validateStageTemplate(base)).toBeNull();
  });
});
