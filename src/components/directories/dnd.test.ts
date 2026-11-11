import { describe, expect, it } from "vitest";
import { arrayMove } from "@dnd-kit/sortable";
import { moveItem } from "./rules";

describe("directory reorder helpers", () => {
  it("moveItem совпадает с arrayMove по индексам", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moveItem(ids, 0, 2)).toEqual(arrayMove(ids, 0, 2));
    expect(moveItem(ids, 3, 1)).toEqual(arrayMove(ids, 3, 1));
    expect(moveItem(ids, 1, 1)).toBeNull();
  });
});
