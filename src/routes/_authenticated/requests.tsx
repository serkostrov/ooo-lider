import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { RequestsList } from "@/components/requests/RequestsList";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/profile";
import { canCreateRequest } from "@/lib/permissions";
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
  const me = useProfile();
  const { data: types = [] } = useRequestTypes();
  const [createOpen, setCreateOpen] = useState(false);
  const allowCreate = canCreateRequest(me);
  const supplyTypeId = useMemo(
    () =>
      me.role_codes.includes("supply") || me.role_code === "supply"
        ? types.find((t) => /снабжен/i.test(t.name))?.id
        : undefined,
    [me.role_code, me.role_codes, types],
  );
  const officeReadyHint = me.role_codes.includes("office") || me.role_code === "office";

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
            allowCreate ? (
              <Button
                onClick={() => setCreateOpen(true)}
                className="h-10 w-full gap-2 px-3 text-sm sm:h-9 sm:w-auto"
              >
                <Plus className="size-4" />
                Создать заявку
              </Button>
            ) : undefined
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
