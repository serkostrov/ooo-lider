-- Понятные ошибки при сохранении журнала (дубликат кода и т.п.).

create or replace function public.registry_save_journal(
  p_id uuid,
  p_code text,
  p_name text,
  p_sort int default 100,
  p_is_active boolean default true,
  p_request_type_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := lower(trim(p_code));
  v_exists uuid;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Укажите название'; end if;
  if v_code is null or v_code !~ '^[a-z][a-z0-9_]{0,31}$' then
    raise exception 'Код: латиница, цифры и _ , с маленькой буквы (например letters2)';
  end if;

  select id into v_exists
  from public.registry_journals
  where code = v_code and deleted_at is null
    and (p_id is null or id is distinct from p_id)
  limit 1;
  if v_exists is not null then
    raise exception 'Журнал с кодом «%» уже есть. Откройте его в списке или придумайте другой код', v_code;
  end if;

  if p_id is not null then
    update public.registry_journals set
      code = v_code,
      name = trim(p_name),
      sort = coalesce(p_sort, sort),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Журнал не найден'; end if;
  else
    insert into public.registry_journals(code, name, sort, is_active)
    values (v_code, trim(p_name), coalesce(p_sort, 100), coalesce(p_is_active, true))
    returning id into v_id;

    insert into public.registry_journal_fields(journal_id, label, field_type, system_key, sort, show_in_table, show_on_accept, is_required)
    values
      (v_id, 'Контрагент', 'text', 'counterparty', 10, true, false, false),
      (v_id, 'Дата исходящего', 'date', 'out_date', 20, true, false, false),
      (v_id, 'Исходящее', 'textarea', 'out_content', 30, true, false, false),
      (v_id, 'Дата входящего', 'date', 'in_date', 40, true, true, false),
      (v_id, '№ письма', 'text', 'in_letter_no', 50, true, true, false),
      (v_id, 'Входящее', 'textarea', 'in_content', 60, true, true, true);
  end if;

  delete from public.registry_journal_request_types where journal_id = v_id;
  if p_request_type_ids is not null and cardinality(p_request_type_ids) > 0 then
    insert into public.registry_journal_request_types(journal_id, request_type_id)
    select v_id, x from unnest(p_request_type_ids) as x
    on conflict do nothing;
  end if;

  return v_id;
end $$;
