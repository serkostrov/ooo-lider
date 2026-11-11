import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import {
  isOptionalEmail,
  isOptionalPhone,
  normalizePhone,
  VALIDATION_MSG,
} from "@/lib/validation";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh } from "@/components/SortableTh";
import { DeleteButton, EditSheet, EmptyRow, Field, FormActions, Toolbar, emptyToNull, matches } from "./common";

const KEY = ["dir-representatives"];
type Rep = { id: string; name: string; phone: string | null; email: string | null; comment: string | null; is_active: boolean };
type RepSort = "name" | "phone" | "email" | "comment" | "active";
const REP_GETTERS: Record<RepSort, (r: Rep) => unknown> = {
  name: (r) => r.name,
  phone: (r) => r.phone,
  email: (r) => r.email,
  comment: (r) => r.comment,
  active: (r) => r.is_active,
};

export function RepresentativesDirectory() {
  const { is_admin } = useProfile();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Rep | "new" | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("representatives")
        .select("id, name, phone, email, comment, is_active")
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return data as Rep[];
    },
  });
  const filtered = data.filter((r) => matches(search, r.name, r.phone, r.email, r.comment));
  const { sort, toggle } = useTableSort<RepSort>();
  const rows = useSortedRows(filtered, sort, REP_GETTERS);
  return (
    <div>
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => setEditing("new") : undefined} />
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <SortableTh as="table" column="name" sort={sort} onToggle={toggle}>Название</SortableTh>
              <SortableTh as="table" column="phone" sort={sort} onToggle={toggle}>Телефон</SortableTh>
              <SortableTh as="table" column="email" sort={sort} onToggle={toggle}>Email</SortableTh>
              <SortableTh as="table" column="comment" sort={sort} onToggle={toggle}>Комментарий</SortableTh>
              <SortableTh as="table" column="active" sort={sort} onToggle={toggle}>Активен</SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? null : rows.length === 0 ? (
              <EmptyRow cols={5} />
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className={is_admin ? "cursor-pointer" : ""} onClick={() => is_admin && setEditing(r)}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.phone}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell className="text-muted-foreground">{r.comment}</TableCell>
                  <TableCell>{r.is_active ? "Да" : "Нет"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <EditSheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Новый представитель" : "Представитель"}>
        {editing !== null && (
          <RepForm key={editing === "new" ? "new" : editing.id} rep={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
        )}
      </EditSheet>
    </div>
  );
}

function RepForm({ rep, onClose }: { rep: Rep | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(rep?.name ?? "");
  const [phone, setPhone] = useState(rep?.phone ?? "");
  const [email, setEmail] = useState(rep?.email ?? "");
  const [comment, setComment] = useState(rep?.comment ?? "");
  const [active, setActive] = useState(rep?.is_active ?? true);
  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        phone: normalizePhone(phone),
        email: emptyToNull(email),
        comment: emptyToNull(comment),
        is_active: active,
      };
      const { error } = rep
        ? await supabase.from("representatives").update(payload).eq("id", rep.id)
        : await supabase.from("representatives").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: showError,
  });
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          toast.error("Заполните название");
          return;
        }
        if (!isOptionalPhone(phone)) {
          toast.error(VALIDATION_MSG.phone);
          return;
        }
        if (!isOptionalEmail(email)) {
          toast.error(VALIDATION_MSG.email);
          return;
        }
        m.mutate();
      }}
    >
      <Field label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
      </Field>
      <Field label="Телефон">
        <PhoneInput value={phone} onChange={setPhone} className="h-9 text-sm" />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" />
      </Field>
      <Field label="Комментарий"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="text-sm" /></Field>
      <label className="flex items-center gap-3 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Активен</label>
      <FormActions
        pending={m.isPending}
        onCancel={onClose}
        danger={
          rep ? (
            <DeleteButton table="representatives" id={rep.id} name={rep.name} invalidate={KEY} onDone={onClose} />
          ) : undefined
        }
      />
    </form>
  );
}
