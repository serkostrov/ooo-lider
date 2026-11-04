import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listFiles } from "@/lib/files";
import type { ObjectStage } from "../data";
import { FileList, UploadButton } from "./FileButtons";

/** Документы этапа: черновик на согласование и подписанный скан, обе версии хранятся (ТЗ 7.6). */
export function StageDocumentsTab({ stage }: { stage: ObjectStage }) {
  const qc = useQueryClient();
  const key = ["stage-files", stage.id];
  const { data: files = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listFiles("stage", [stage.id]),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["history"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <UploadButton
          objectId={stage.object_id}
          entityType="stage"
          entityId={stage.id}
          kind="draft"
          label="+ Черновик на согласование"
          onUploaded={refresh}
        />
        <UploadButton
          objectId={stage.object_id}
          entityType="stage"
          entityId={stage.id}
          kind="signed"
          label="+ Подписанный скан"
          variant="default"
          onUploaded={refresh}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Фото с телефона или планшета загружаются так же — кнопка предложит камеру или галерею.
      </p>
      {isLoading ? null : files.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Документов пока нет</p>
      ) : (
        <FileList files={files} showKind />
      )}
    </div>
  );
}
