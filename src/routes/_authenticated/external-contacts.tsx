import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditSheet } from "@/components/directories/common";
import {
  ExternalContactForm,
  topLevelContacts,
  useExternalContacts,
  type ExternalContact,
} from "@/components/directories/ExternalContactsDirectory";
import { CUSTOMERS_KEY, type Customer } from "@/components/directories/CustomerForm";
import { ExternalContactsTable } from "@/components/external-contacts/ExternalContactsTable";
import {
  EMPTY_EXTERNAL_CONTACTS_FILTERS,
  filterExternalContacts,
  ExternalContactsToolbar,
  type ExternalContactsFilterState,
} from "@/components/external-contacts/ExternalContactsToolbar";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/external-contacts")({
  component: ExternalContactsPage,
  head: () => ({
    meta: [
      { title: "Внешние контакты — Лидер" },
      {
        name: "description",
        content: "Люди, организации и службы по заказчикам",
      },
    ],
  }),
});

const tabTriggerClass =
  "h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm sm:px-3 sm:text-sm";

const TAB_ALL = "all";
const TAB_NONE = "none";

function CountPill({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        "bg-muted text-muted-foreground",
        "group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary",
      )}
    >
      {count}
    </span>
  );
}

function useCustomersList() {
  return useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, inn, kpp, ogrn, legal_address, comment")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
}

function CustomerPanel({
  customerId,
  canEdit,
  defaultCustomerId,
}: {
  /** null — все; "" — без заказчика; uuid — заказчик. */
  customerId: string | null;
  canEdit: boolean;
  defaultCustomerId: string | null;
}) {
  const { data = [], isLoading, isError, error, refetch } = useExternalContacts(false);
  const [filters, setFilters] = useState<ExternalContactsFilterState>(
    EMPTY_EXTERNAL_CONTACTS_FILTERS,
  );
  const [editing, setEditing] = useState<ExternalContact | "new" | null>(null);

  const filtered = useMemo(
    () => filterExternalContacts(data, filters, customerId),
    [data, filters, customerId],
  );

  const showCustomerColumn = customerId === null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <ExternalContactsToolbar
          filters={filters}
          onChange={setFilters}
          onAdd={canEdit ? () => setEditing("new") : undefined}
        />
      </div>
      {isError ? (
        <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          Не удалось загрузить контакты:{" "}
          {error instanceof Error ? error.message : "ошибка БД"}.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Повторить
          </button>
        </p>
      ) : null}
      {filtered.length === 0 && data.length > 0 && !isLoading ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Ничего не найдено. Сбросьте поиск или фильтры.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <ExternalContactsTable
            rows={filtered}
            allRows={data}
            isLoading={isLoading}
            isError={isError}
            canEdit={canEdit}
            showCustomerColumn={showCustomerColumn}
            onEdit={setEditing}
          />
        </div>
      )}
      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новый контакт" : "Внешний контакт"}
      >
        {editing !== null && (
          <ExternalContactForm
            key={
              editing === "new"
                ? `new-${defaultCustomerId ?? "none"}`
                : editing.id
            }
            contact={editing === "new" ? null : editing}
            defaultCustomerId={editing === "new" ? defaultCustomerId : null}
            onClose={() => setEditing(null)}
          />
        )}
      </EditSheet>
    </div>
  );
}

function ExternalContactsPage() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const canEdit = is_admin;
  const { data: customers = [], isLoading: customersLoading } = useCustomersList();
  const { data: contacts = [] } = useExternalContacts(false);
  const [tab, setTab] = useState(TAB_ALL);

  const counts = useMemo(() => {
    const roots = topLevelContacts(contacts);
    const byCustomer = new Map<string, number>();
    let none = 0;
    for (const c of roots) {
      if (!c.customer_id) {
        none += 1;
        continue;
      }
      byCustomer.set(c.customer_id, (byCustomer.get(c.customer_id) ?? 0) + 1);
    }
    return { byCustomer, none, total: roots.length };
  }, [contacts]);

  useEffect(() => {
    if (!is_admin) void navigate({ to: "/objects" });
  }, [is_admin, navigate]);

  useEffect(() => {
    if (tab === TAB_ALL) return;
    if (tab === TAB_NONE) {
      if (counts.none === 0) setTab(TAB_ALL);
      return;
    }
    if ((counts.byCustomer.get(tab) ?? 0) === 0) setTab(TAB_ALL);
  }, [counts, tab]);

  if (!is_admin) {
    return (
      <div className="py-10 text-sm text-muted-foreground">
        Раздел доступен только администратору и руководителю.{" "}
        <Link to="/objects" className="text-primary hover:underline">
          К объектам
        </Link>
      </div>
    );
  }

  return (
    <PageFrame
      header={
        <PageHeader
          title={
            <span className="inline-flex items-center gap-2.5">
              Внешние контакты
              {!customersLoading ? (
                <span
                  className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-sm font-semibold tabular-nums text-muted-foreground"
                  title={`Всего контактов: ${counts.total}`}
                >
                  {counts.total}
                </span>
              ) : null}
            </span>
          }
          description="Люди, организации и службы. На карточке этапа их можно привязать к этапу."
          className="mb-0"
        />
      }
    >
      {customersLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex h-full min-h-0 flex-col gap-4 overflow-hidden"
        >
          <TabsList
            className={cn(
              "inline-flex h-auto w-fit max-w-full shrink-0 flex-wrap justify-start gap-0.5 rounded-md border border-border bg-muted/40 p-0.5",
            )}
          >
            <TabsTrigger value={TAB_ALL} className={cn(tabTriggerClass, "group")}>
              <span className="inline-flex items-center gap-1.5">
                Все
                <CountPill count={counts.total} />
              </span>
            </TabsTrigger>
            {customers
              .filter((c) => (counts.byCustomer.get(c.id) ?? 0) > 0)
              .map((c) => (
                <TabsTrigger key={c.id} value={c.id} className={cn(tabTriggerClass, "group")}>
                  <span className="inline-flex items-center gap-1.5">
                    {c.name}
                    <CountPill count={counts.byCustomer.get(c.id) ?? 0} />
                  </span>
                </TabsTrigger>
              ))}
            {counts.none > 0 ? (
              <TabsTrigger value={TAB_NONE} className={cn(tabTriggerClass, "group")}>
                <span className="inline-flex items-center gap-1.5">
                  Без заказчика
                  <CountPill count={counts.none} />
                </span>
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent
            value={TAB_ALL}
            className="mt-0 min-h-0 flex-1 overflow-hidden outline-none data-[state=inactive]:hidden"
          >
            <CustomerPanel
              customerId={null}
              canEdit={canEdit}
              defaultCustomerId={null}
            />
          </TabsContent>
          {customers
            .filter((c) => (counts.byCustomer.get(c.id) ?? 0) > 0)
            .map((c) => (
              <TabsContent
                key={c.id}
                value={c.id}
                className="mt-0 min-h-0 flex-1 overflow-hidden outline-none data-[state=inactive]:hidden"
              >
                <CustomerPanel
                  customerId={c.id}
                  canEdit={canEdit}
                  defaultCustomerId={c.id}
                />
              </TabsContent>
            ))}
          {counts.none > 0 ? (
            <TabsContent
              value={TAB_NONE}
              className="mt-0 min-h-0 flex-1 overflow-hidden outline-none data-[state=inactive]:hidden"
            >
              <CustomerPanel
                customerId=""
                canEdit={canEdit}
                defaultCustomerId={null}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </PageFrame>
  );
}
