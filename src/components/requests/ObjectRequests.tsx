import { RequestsList } from "./RequestsList";

/** Заявки объекта: фильтр вида — кнопки слева; тулбар можно вынести в chromeHost. */
export function ObjectRequests({
  objectId,
  typeId,
  onTypeChange,
  chromeHost,
  fillHeight,
}: {
  objectId: string;
  typeId: string | undefined;
  onTypeChange: (typeId: string | undefined) => void;
  chromeHost?: HTMLElement | null;
  fillHeight?: boolean;
}) {
  return (
    <RequestsList
      objectId={objectId}
      typeId={typeId}
      onTypeChange={onTypeChange}
      hideCreateButton
      {...(chromeHost !== undefined ? { chromeHost } : {})}
      {...(fillHeight ? { fillHeight: true } : {})}
    />
  );
}
