import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/** Sensors: мышь/тач + клавиатура (a11y). */
export function useDirectoryDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Новый порядок id после drag; null если без изменений. */
export function orderedIdsAfterDrag(
  ids: UniqueIdentifier[],
  event: DragEndEvent,
): string[] | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const from = ids.indexOf(active.id);
  const to = ids.indexOf(over.id);
  if (from < 0 || to < 0) return null;
  return arrayMove(ids.map(String), from, to);
}
