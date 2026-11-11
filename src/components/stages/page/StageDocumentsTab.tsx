import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listFiles } from "@/lib/files";
import { Skeleton } from "@/components/ui/skeleton";
import type { ObjectStage } from "../data";
import { FileList, StageFilesDropZones } from "./FileButtons";

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
      <p className="text-sm text-muted-foreground">
        Перетащите файлы в зону или нажмите на неё. С телефона или планшета откроются камера или галерея.
      </p>

      <StageFilesDropZones objectId={stage.object_id} entityId={stage.id} onUploaded={refresh}>
        {isLoading ? (
          <ul className="divide-y overflow-hidden rounded-md border border-border bg-card">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton height={16} width={16} borderRadius={4} />
                <Skeleton height={16} width={`${45 + i * 12}%`} containerClassName="flex-1" />
                <Skeleton height={12} width={96} />
              </li>
            ))}
          </ul>
        ) : files.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Документов пока нет — перетащите или выберите файлы</p>
        ) : (
          <FileList files={files} showKind />
        )}
      </StageFilesDropZones>
    </div>
  );
}
