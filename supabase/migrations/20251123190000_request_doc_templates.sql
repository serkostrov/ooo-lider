-- Шаблоны исходящих заявок (технадзор Excel и далее лабы).
-- На объекте: № проекта и регистрация УТН.
-- В полях вида заявки: значение по умолчанию (ответственный и т.п.).

alter table public.objects
  add column if not exists project_number text,
  add column if not exists utn_number text,
  add column if not exists utn_date date;

comment on column public.objects.project_number is '№ проекта / заказ (напр. №МГ-3161-с/24.)';
comment on column public.objects.utn_number is 'Регистрация УТН — номер';
comment on column public.objects.utn_date is 'Регистрация УТН — дата';

alter table public.request_types
  add column if not exists doc_template text;

comment on column public.request_types.doc_template is
  'Код генератора бланка: technadzor_xlsx, lab_docx, … NULL — без автобланка';

alter table public.request_type_fields
  add column if not exists default_value jsonb;

comment on column public.request_type_fields.default_value is
  'Подставляется в новую заявку, если значение ещё пустое (редактируется в карточке)';

-- create_object: прокидываем новые поля объекта
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
    curator_contact_id, technadzor_contact_id, technadzor_ehz_contact_id,
    project_number, utn_number, utn_date
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
    nullif(p_object->>'technadzor_ehz_contact_id','')::uuid,
    nullif(trim(coalesce(p_object->>'project_number','')), ''),
    nullif(trim(coalesce(p_object->>'utn_number','')), ''),
    nullif(p_object->>'utn_date','')::date
  )
  returning id into v_id;

  insert into public.object_members(object_id, profile_id)
  select v_id, unnest(coalesce(p_member_ids, '{}')) on conflict do nothing;

  perform public.log_history(v_id, 'object', v_id, 'created', 'Объект создан', p_object);
  perform public.add_object_stages(v_id, coalesce(p_template_ids, '{}'));
  return v_id;
end $$;

-- Технадзор → Excel
update public.request_types
set doc_template = 'technadzor_xlsx'
where name = 'Технадзор' and deleted_at is null and doc_template is null;

-- Поля для бланка технадзора (идемпотентно по label)
do $$
declare
  tid uuid;
begin
  select id into tid from public.request_types
  where name = 'Технадзор' and deleted_at is null
  order by sort limit 1;
  if tid is null then return; end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Время вызова' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Время вызова', 'text', true, 'initiator', 5);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Виды работ' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Виды работ', 'textarea', true, 'initiator', 6);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Ответственный за производство работ' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (
      tid,
      'Ответственный за производство работ',
      'text',
      true,
      'initiator',
      7,
      '"Балаев Юнус +7-999-999-00-65"'::jsonb
    );
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Примечание' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Примечание', 'textarea', false, 'initiator', 8);
  end if;
end $$;
