import { describe, expect, it } from "vitest";
import { buildGeotrestFillInput, geotrestMessageBody } from "./geotrest";

describe("geotrest message", () => {
  it("собирает текст для Max", () => {
    const input = buildGeotrestFillInput({
      callDate: "2026-09-22",
      values: [
        { label: "Вид вызова", value: "КГС" },
        { label: "Коммуникация и объём", value: "Газопровод 50 п.м." },
        { label: "Точный адрес для вызова", value: "Рождественская, д. 4" },
        {
          label: "Ответственный на объекте",
          value: "Иванов Иван Иванович +7 999 999 99 99",
        },
      ],
      fields: [],
      objectCtx: {
        name: "Догазификация населенных пунктов г. Москвы",
        address: "не использовать",
        projectNumber: "22.107",
      },
    });
    const text = geotrestMessageBody(input);
    expect(text).toContain("КГС на 22.09.2026");
    expect(text).toContain("22.107 Догазификация");
    expect(text).toContain("Газопровод 50 п.м.");
    expect(text).toContain("Рождественская, д. 4");
    expect(text).toContain("Иванов Иван Иванович");
  });
});
