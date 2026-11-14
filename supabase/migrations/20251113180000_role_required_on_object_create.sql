-- Роли, обязательные при создании объекта (настраивается в справочнике ролей).

alter table public.roles
  add column if not exists required_on_object_create boolean not null default false;

comment on column public.roles.required_on_object_create is
  'При создании объекта нужен ≥1 участник с этой ролью';

-- Сохраняем прежнее поведение: сметчик обязателен.
update public.roles
set required_on_object_create = true
where code = 'estimator';

create or replace function public.create_object(p_object jsonb, p_member_ids uuid[], p_template_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_role record;
  v_cnt int;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  for v_role in
    select code, name
    from public.roles
    where required_on_object_create
    order by sort, name
  loop
    select count(*) into v_cnt
    from public.profiles p
    where p.id = any(coalesce(p_member_ids, '{}'))
      and p.role_code = v_role.code
      and p.deleted_at is null;
    if v_cnt < 1 then
      raise exception 'Назначьте хотя бы одного участника с ролью «%»', v_role.name;
    end if;
  end loop;

  insert into public.objects(
    name, address, customer_id, object_type, contract_start, contract_end,
    responsible_id, status, notes, created_by,
    curator_contact_id, technadzor_contact_id, technadzor_ehz_contact_id
  )
  values (
    p_object->>'name',
    p_object->>'address',
    nullif(p_object->>'customer_id','')::uuid,
    coalesce(p_object->>'object_type','uks'),
    nullif(p_object->>'contract_start','')::date,
    nullif(p_object->>'contract_end','')::date,
    nullif(p_object->>'responsible_id','')::uuid,
    coalesce(p_object->>'status','in_work'),
    p_object->>'notes',
    public.current_profile_id(),
    nullif(p_object->>'curator_contact_id','')::uuid,
    nullif(p_object->>'technadzor_contact_id','')::uuid,
    nullif(p_object->>'technadzor_ehz_contact_id','')::uuid
  )
  returning id into v_id;

  insert into public.object_members(object_id, profile_id)
  select v_id, unnest(coalesce(p_member_ids, '{}')) on conflict do nothing;

  perform public.log_history(v_id, 'object', v_id, 'created', 'Объект создан', p_object);
  perform public.add_object_stages(v_id, coalesce(p_template_ids, '{}'));
  return v_id;
end $$;
