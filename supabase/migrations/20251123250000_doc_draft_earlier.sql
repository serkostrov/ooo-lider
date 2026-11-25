-- Черновик бланка: офис может править с любого шага, кроме «Исполнена».

create or replace function public.request_save_doc_draft(p_request_id uuid, p_draft jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  if not (public.is_admin() or public.has_role('office')) then
    raise exception 'Черновик бланка сохраняет офис-менеджер';
  end if;
  if r.status = 'done' then
    raise exception 'После «Исполнена» бланк уже не правят';
  end if;

  update public.requests
  set doc_draft = p_draft, updated_at = now()
  where id = r.id;
end $$;
