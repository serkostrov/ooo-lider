import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { CustomerCard } from "@/components/directories/CustomerCard";
import { CustomerForm, CUSTOMERS_KEY, type Customer } from "@/components/directories/CustomerForm";

export const Route = createFileRoute("/_authenticated/directories_/customers/$id")({
  component: CustomerCardPage,
  head: () => ({ meta: [{ title: "Заказчик — Лидер" }] }),
});

function CustomerCardPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { is_admin } = useProfile();
  const isNew = id === "new";

  const { data: customer = null, isLoading } = useQuery({
    queryKey: [...CUSTOMERS_KEY, id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, inn, kpp, ogrn, legal_address, comment")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as Customer | null;
    },
  });

  const back = (
    <Link
      to="/directories"
      search={{ tab: "customers" }}
      className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <ArrowLeft className="size-4" /> К справочнику
    </Link>
  );

  const goList = () => navigate({ to: "/directories", search: { tab: "customers" } });

  if (isLoading) return <div className="text-base text-muted-foreground">Загрузка…</div>;

  if (isNew) {
    if (!is_admin) {
      return (
        <div>
          {back}
          <p className="py-10 text-base text-muted-foreground">
            Добавлять заказчиков может только администратор
          </p>
        </div>
      );
    }
    return (
      <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
        {back}
        <h1 className="text-xl font-semibold tracking-tight">Новый заказчик</h1>
        <div className="max-w-3xl">
          <CustomerForm
            onSaved={(c) =>
              navigate({ to: "/directories/customers/$id", params: { id: c.id }, replace: true })
            }
            onCancel={goList}
          />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div>
        {back}
        <p className="py-10 text-base text-muted-foreground">Заказчик не найден или удалён</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
      {back}
      <CustomerCard key={customer.id} customer={customer} onDeleted={goList} />
    </div>
  );
}
