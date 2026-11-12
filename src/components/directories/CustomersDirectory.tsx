import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh } from "@/components/SortableTh";
import { EmptyRow, Toolbar, matches } from "./common";
import { DirectoryTableSkeleton } from "./DirectorySkeleton";
import { CUSTOMERS_KEY, type Customer } from "./CustomerForm";

type CustSort = "name" | "inn" | "address" | "comment";
const CUST_GETTERS: Record<CustSort, (c: Customer) => unknown> = {
  name: (c) => c.name,
  inn: (c) => c.inn,
  address: (c) => c.legal_address,
  comment: (c) => c.comment,
};

export function CustomersDirectory() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data = [], isLoading } = useQuery({
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
  const filtered = data.filter((c) => matches(search, c.name, c.inn, c.legal_address, c.comment));
  const { sort, toggle } = useTableSort<CustSort>();
  const rows = useSortedRows(filtered, sort, CUST_GETTERS);
  const open = (id: string) => navigate({ to: "/directories/customers/$id", params: { id } });

  return (
    <div>
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => open("new") : undefined} />
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <SortableTh as="table" column="name" sort={sort} onToggle={toggle}>
                Название
              </SortableTh>
              <SortableTh as="table" column="inn" sort={sort} onToggle={toggle}>
                ИНН
              </SortableTh>
              <SortableTh as="table" column="address" sort={sort} onToggle={toggle}>
                Адрес
              </SortableTh>
              <SortableTh as="table" column="comment" sort={sort} onToggle={toggle}>
                Комментарий
              </SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <DirectoryTableSkeleton cols={4} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={4} />
            ) : (
              rows.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => open(c.id)}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.inn}</TableCell>
                  <TableCell>{c.legal_address}</TableCell>
                  <TableCell className="text-muted-foreground">{c.comment}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
