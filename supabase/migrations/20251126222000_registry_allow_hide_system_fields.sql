-- Системные поля журнала можно скрыть/удалить из UI (soft delete).

create or replace function public.registry_soft_delete_journal_field(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  update public.registry_journal_fields
  set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Поле не найдено';
  end if;
end $$;
