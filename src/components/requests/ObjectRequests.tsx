import { RequestsList } from "./RequestsList";

/** Заявки объекта: фильтр вида — компактный select в панели фильтров. */
export function ObjectRequests({
  objectId,
  typeId,
  onTypeChange,
}: {
  objectId: string;
  typeId: string | undefined;
  onTypeChange: (typeId: string | undefined) => void;
}) {
  return <RequestsList objectId={objectId} typeId={typeId} onTypeChange={onTypeChange} />;
}
