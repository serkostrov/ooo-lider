import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { RequestsList } from "@/components/requests/RequestsList";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/profile";
import { useRequestTypes } from "@/components/directories/request-types/data";

export const Route = createFileRoute("/_authenticated/requests")({
  component: RequestsPage,
  head: () => ({
    meta: [
      { title: "Заявки — Лидер" },
      { name: "description", content: "Заявки по всем объектам в системе «Лидер»" },
    ],
  }),
});

function RequestsPage() {
  const { role_code } = useProfile();
  const { data: types = [] } = useRequestTypes();
  const [createOpen, setCreateOpen] = useState(false);
  const supplyTypeId = useMemo(
    () => (role_code === "supply" ? types.find((t) => /снабжен/i.test(t.name))?.id : undefined),
    [role_code, types],
  );
  const officeReadyHint = role_code === "office";

  return (
    <PageFrame
      header={
        <PageHeader
          title="Заявки"
          description={
            officeReadyHint
              ? "Очередь офис-менеджера: сверху новые и готовые к отправке. Поиск — по номеру и значениям полей."
              : supplyTypeId
                ? "Заказы снабжения по всем объектам."
                : "По всем объектам. Сверху новые, затем просроченные. Поиск — по номеру заявки и значениям полей."
          }
          className="mb-0"
          actions={
            <Button onClick={() => setCreateOpen(true)} className="h-9 gap-2 px-3 text-sm">
              <Plus className="size-4" />
              Создать заявку
            </Button>
          }
        />
      }
    >
      <RequestsList
        typeId={supplyTypeId}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        hideCreateButton
        fillHeight
      />
    </PageFrame>
  );
}
