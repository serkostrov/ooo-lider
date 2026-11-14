-- =====================================================================
-- Иерархия этапов (подэтапы), code, повторы шаблонов, роли, RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Колонки parent_id + code
-- ---------------------------------------------------------------------
alter table public.object_stages
  add column if not exists parent_id uuid references public.object_stages(id);

alter table public.object_stages
  add column if not exists code text;

update public.object_stages
set code = number::text
where code is null;

alter table public.object_stages
  alter column code set not null;

create index if not exists object_stages_object_parent_sort_idx
  on public.object_stages (object_id, parent_id, sort);

create or replace function public.tg_object_stages_parent_check()
returns trigger language plpgsql set search_path = public as $$
declare
  v_parent public.object_stages;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Этап не может быть родителем сам себе';
  end if;

  select * into v_parent
  from public.object_stages
  where id = new.parent_id and deleted_at is null;

  if not found then
    raise exception 'Родительский этап не найден';
  end if;

  if v_parent.object_id <> new.object_id then
    raise exception 'Подэтап должен принадлежать тому же объекту';
  end if;

  if v_parent.parent_id is not null then
    raise exception 'Подэтап не может иметь вложенных подэтапов';
  end if;

  return new;
end $$;

drop trigger if exists object_stages_parent_check on public.object_stages;
create trigger object_stages_parent_check
  before insert or update of parent_id, object_id
  on public.object_stages
  for each row execute function public.tg_object_stages_parent_check();

-- ---------------------------------------------------------------------
-- 2. Роли сметчик / бригадир
-- ---------------------------------------------------------------------
insert into public.roles(code, name, is_admin, sort) values
  ('estimator', 'Сметчик',  false, 7),
  ('brigadier', 'Бригадир', false, 8)
on conflict (code) do update set name = excluded.name, sort = excluded.sort;

-- ---------------------------------------------------------------------
-- 3. renumber_object_stages — топ 1..n, дети "{parent}.{k}"
-- ---------------------------------------------------------------------
create or replace function public.renumber_object_stages(p_object_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_parent_id uuid;
  v_child_id uuid;
  v_top int := 0;
  v_k int;
  v_sort int := 0;
  v_parent_code text;
begin
  -- Временные отрицательные номера, чтобы не пересечься при обновлении
  update public.object_stages s
  set number = -o.rn, sort = -o.rn
  from (
    select id, row_number() over (order by sort, number, created_at) as rn
    from public.object_stages
    where object_id = p_object_id and deleted_at is null
  ) o
  where s.id = o.id;

  for v_parent_id in
    select id
    from public.object_stages
    where object_id = p_object_id and deleted_at is null and parent_id is null
    order by abs(sort), abs(number), created_at
  loop
    v_top := v_top + 1;
    v_sort := v_sort + 1;
    v_parent_code := v_top::text;
    update public.object_stages
    set number = v_top, sort = v_sort, code = v_parent_code
    where id = v_parent_id;

    v_k := 0;
    for v_child_id in
      select id
      from public.object_stages
      where object_id = p_object_id and deleted_at is null and parent_id = v_parent_id
      order by abs(sort), abs(number), created_at
    loop
      v_k := v_k + 1;
      v_sort := v_sort + 1;
      update public.object_stages
      set number = v_top, sort = v_sort, code = v_parent_code || '.' || v_k::text
      where id = v_child_id;
    end loop;
  end loop;
end $$;

revoke all on function public.renumber_object_stages(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. add_object_stages — допускает повторы template_id
-- ---------------------------------------------------------------------
create or replace function public.add_object_stages(p_object_id uuid, p_template_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_tid uuid;
  t record;
  v_stage uuid;
  v_count int := 0;
  v_first int;
  v_next int;
  v_new_ids uuid[] := '{}';
  v_pred uuid;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select coalesce(max(number), 0) into v_next
  from public.object_stages
  where object_id = p_object_id and deleted_at is null and parent_id is null;

  foreach v_tid in array coalesce(p_template_ids, '{}')
  loop
    select * into t from public.stage_templates
    where id = v_tid and deleted_at is null;
    if not found then continue; end if;

    v_next := v_next + 1;
    insert into public.object_stages(
      object_id, template_id, number, code, name, work_type_id, description,
      duration_days, confirmer_role, outgoing_doc, expected_doc, response_days, remind_days,
      is_critical, sort, parent_id
    )
    values (
      p_object_id, t.id, v_next, v_next::text, t.name, t.work_type_id, t.description, t.duration_days,
      t.confirmer_role, t.outgoing_doc, t.expected_doc, t.response_days, t.remind_days,
      t.is_critical, v_next, null
    )
    returning id into v_stage;

    v_new_ids := array_append(v_new_ids, v_stage);

    insert into public.object_stage_conditions(stage_id, title, kind, is_required, to_id_folder, document_id, sort)
    select v_stage, c.title, c.kind, c.is_required, c.to_id_folder, c.document_id, c.sort
    from public.stage_template_conditions c where c.template_id = t.id and c.deleted_at is null;

    select min(step_no) into v_first from public.stage_template_steps
    where template_id = t.id and deleted_at is null;
    insert into public.object_stage_steps(stage_id, step_no, role_code, action, action_kind, duration_days, state)
    select v_stage, st.step_no, st.role_code, st.action, st.action_kind, st.duration_days,
           case when st.step_no = v_first then 'current' else 'pending' end
    from public.stage_template_steps st where st.template_id = t.id and st.deleted_at is null;

    update public.object_stages s set executor_id = (
      select m.profile_id from public.object_members m join public.profiles p on p.id = m.profile_id
      where m.object_id = p_object_id and p.role_code = t.executor_role and p.deleted_at is null
      order by m.created_at limit 1)
    where s.id = v_stage and t.executor_role is not null;

    v_count := v_count + 1;
  end loop;

  -- Predecessors только для только что добавленных: один конкретный экземпляр (последний по sort)
  foreach v_stage in array v_new_ids
  loop
    for t in
      select tp.predecessor_id
      from public.object_stages s
      join public.stage_template_predecessors tp on tp.template_id = s.template_id
      where s.id = v_stage
    loop
      select sp.id into v_pred
      from public.object_stages sp
      where sp.object_id = p_object_id
        and sp.template_id = t.predecessor_id
        and sp.deleted_at is null
        and sp.parent_id is null
        and sp.id <> v_stage
      order by sp.sort desc, sp.created_at desc
      limit 1;
      if v_pred is not null then
        insert into public.object_stage_predecessors(stage_id, predecessor_id)
        values (v_stage, v_pred)
        on conflict do nothing;
      end if;
    end loop;
  end loop;

  perform public.renumber_object_stages(p_object_id);

  if v_count > 0 then
    perform public.log_history(p_object_id, 'object', p_object_id, 'stages_added',
      format('Добавлено этапов: %s', v_count), jsonb_build_object('template_ids', p_template_ids));
  end if;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- 5. add_object_substage
-- ---------------------------------------------------------------------
create or replace function public.add_object_substage(
  p_parent_id uuid,
  p_name text,
  p_description text default null,
  p_executor_id uuid default null,
  p_duration_days int default null,
  p_confirmer_role text default null,
  p_work_type_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_parent public.object_stages;
  v_id uuid;
  v_k int;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select * into v_parent
  from public.object_stages
  where id = p_parent_id and deleted_at is null;
  if not found then raise exception 'Родительский этап не найден'; end if;
  if v_parent.parent_id is not null then
    raise exception 'Подэтап не может иметь вложенных подэтапов';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Укажите название подэтапа';
  end if;

  select coalesce(max(
    case when code ~ ('^' || v_parent.code || '\.[0-9]+$')
      then nullif(split_part(code, '.', 2), '')::int else 0 end
  ), 0) + 1 into v_k
  from public.object_stages
  where parent_id = p_parent_id and deleted_at is null;

  insert into public.object_stages(
    object_id, parent_id, template_id, number, code, name, work_type_id, description,
    duration_days, confirmer_role, executor_id, is_critical, sort
  )
  values (
    v_parent.object_id, p_parent_id, null, v_parent.number,
    v_parent.code || '.' || v_k::text, trim(p_name),
    coalesce(p_work_type_id, v_parent.work_type_id), p_description,
    p_duration_days, coalesce(p_confirmer_role, v_parent.confirmer_role),
    p_executor_id, false, v_parent.sort
  )
  returning id into v_id;

  perform public.renumber_object_stages(v_parent.object_id);
  perform public.log_history(v_parent.object_id, 'stage', v_id, 'substage_added',
    format('Добавлен подэтап «%s» к этапу %s', trim(p_name), v_parent.code));
  return v_id;
end $$;

revoke all on function public.add_object_substage(uuid, text, text, uuid, int, text, uuid) from public, anon;
grant execute on function public.add_object_substage(uuid, text, text, uuid, int, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. reorder_object_stages — порядок среди siblings (один parent)
-- ---------------------------------------------------------------------
create or replace function public.reorder_object_stages(p_object_id uuid, p_ordered_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_i int := 0;
  v_parent uuid;
  v_expected_parent uuid;
  v_cnt int;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    return;
  end if;

  select parent_id into v_expected_parent
  from public.object_stages
  where id = p_ordered_ids[1] and object_id = p_object_id and deleted_at is null;
  if not found then raise exception 'Этап не найден'; end if;

  foreach v_id in array p_ordered_ids
  loop
    select parent_id into v_parent
    from public.object_stages
    where id = v_id and object_id = p_object_id and deleted_at is null;
    if not found then raise exception 'Этап не найден'; end if;
    if v_parent is distinct from v_expected_parent then
      raise exception 'Нельзя менять порядок этапов с разными родителями';
    end if;
  end loop;

  select count(*) into v_cnt
  from public.object_stages
  where object_id = p_object_id and deleted_at is null
    and parent_id is not distinct from v_expected_parent;
  if v_cnt <> array_length(p_ordered_ids, 1) then
    raise exception 'Передайте полный список этапов одного уровня';
  end if;

  foreach v_id in array p_ordered_ids
  loop
    v_i := v_i + 1;
    update public.object_stages set sort = v_i where id = v_id;
  end loop;

  perform public.renumber_object_stages(p_object_id);
end $$;

revoke all on function public.reorder_object_stages(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_object_stages(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 7. soft-delete этапа / подэтапа
-- ---------------------------------------------------------------------
create or replace function public.delete_object_stage(p_stage_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.object_stages;
  v_req int;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select * into s from public.object_stages where id = p_stage_id and deleted_at is null;
  if not found then raise exception 'Этап не найден'; end if;

  select count(*) into v_req
  from public.requests
  where stage_id = p_stage_id and deleted_at is null;
  if v_req > 0 then
    raise exception 'Нельзя удалить этап: есть заявки (%). Сначала отвяжите или закройте их.', v_req;
  end if;

  -- дети без заявок
  if exists (
    select 1 from public.object_stages c
    join public.requests r on r.stage_id = c.id and r.deleted_at is null
    where c.parent_id = p_stage_id and c.deleted_at is null
  ) then
    raise exception 'Нельзя удалить этап: у подэтапов есть заявки';
  end if;

  update public.object_stages
  set deleted_at = now()
  where parent_id = p_stage_id and deleted_at is null;

  update public.object_stages
  set deleted_at = now()
  where id = p_stage_id;

  perform public.renumber_object_stages(s.object_id);
  perform public.log_history(s.object_id, 'stage', s.id, 'deleted',
    format('Этап %s «%s» удалён', coalesce(s.code, s.number::text), s.name));
end $$;

revoke all on function public.delete_object_stage(uuid) from public, anon;
grant execute on function public.delete_object_stage(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. create_object — обязателен ≥1 сметчик
-- ---------------------------------------------------------------------
create or replace function public.create_object(p_object jsonb, p_member_ids uuid[], p_template_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_estimators int;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select count(*) into v_estimators
  from public.profiles p
  where p.id = any(coalesce(p_member_ids, '{}'))
    and p.role_code = 'estimator'
    and p.deleted_at is null;
  if v_estimators < 1 then
    raise exception 'Назначьте хотя бы одного сметчика';
  end if;

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

-- ---------------------------------------------------------------------
-- 9. История: code вместо голого number
-- ---------------------------------------------------------------------
create or replace function public.stage_set_status(p_stage_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.object_stages; v_open_required int; v_name text; v_old text; v_label text;
begin
  select * into s from public.object_stages where id = p_stage_id and deleted_at is null for update;
  if not found then raise exception 'Этап не найден'; end if;
  if not public.can_see_object(s.object_id) then raise exception 'Нет прав'; end if;
  if not exists (select 1 from public.stage_statuses where code = p_status) then
    raise exception 'Неизвестный статус %', p_status; end if;

  if p_status in ('on_review','closed') then
    select count(*) into v_open_required from public.object_stage_conditions
    where stage_id = s.id and deleted_at is null and is_required and not is_done;
    if v_open_required > 0 then
      raise exception 'Не отмечены условия закрытия: %', v_open_required; end if;
  end if;

  if p_status = 'closed' and not (public.is_admin()
       or coalesce(s.confirmer_id = public.current_profile_id(), false)) then
    raise exception 'Закрыть этап может только адресат или руководитель'; end if;

  if s.status_code = 'on_review' and p_status in ('in_work','not_started') and coalesce(trim(p_comment),'') = '' then
    raise exception 'Укажите причину возврата'; end if;

  perform set_config('lider.rpc', 'on', true);
  v_old := s.status_code;
  v_label := coalesce(s.code, s.number::text);

  update public.object_stages set
    status_code = p_status,
    start_date  = case when p_status <> 'not_started' and start_date is null then public.msk_today() else start_date end,
    due_date    = case when p_status <> 'not_started' and due_date is null and duration_days is not null
                       then coalesce(start_date, public.msk_today()) + duration_days else due_date end,
    doc_sent_at = case when p_status in ('sent','on_approval') and doc_sent_at is null then public.msk_today() else doc_sent_at end,
    closed_at   = case when p_status = 'closed' then now() else null end,
    closed_by   = case when p_status = 'closed' then public.current_profile_id() else null end,
    return_reason = case when v_old = 'on_review' and p_status in ('in_work','not_started') then p_comment else return_reason end,
    out_of_order = out_of_order or (v_old = 'not_started' and p_status <> 'not_started' and exists (
      select 1 from public.object_stage_predecessors pr join public.object_stages ps on ps.id = pr.predecessor_id
      where pr.stage_id = s.id and ps.status_code <> 'closed' and not ps.is_excluded and ps.deleted_at is null))
  where id = s.id;

  select name into v_name from public.stage_statuses where code = p_status;
  perform public.log_history(s.object_id, 'stage', s.id, 'status_changed',
    format('Этап %s «%s»: %s%s', v_label, s.name, v_name,
           case when p_comment is not null and p_comment <> '' then ' — ' || p_comment else '' end),
    jsonb_build_object('from', v_old, 'to', p_status));
end $$;

create or replace function public.stage_condition_set(p_condition_id uuid, p_done boolean, p_value text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select oc.*, s.object_id, coalesce(s.code, s.number::text) as stage_label, s.name as stage_name into c
  from public.object_stage_conditions oc join public.object_stages s on s.id = oc.stage_id
  where oc.id = p_condition_id;
  if not found then raise exception 'Условие не найдено'; end if;
  if not public.can_see_object(c.object_id) then raise exception 'Нет прав'; end if;
  if p_done and c.kind = 'file' and not exists (
      select 1 from public.files f where f.entity_type = 'stage_condition' and f.entity_id = c.id and f.deleted_at is null) then
    raise exception 'Сначала прикрепите файл'; end if;
  if p_done and c.kind = 'field' and coalesce(trim(p_value), '') = '' then
    raise exception 'Заполните значение'; end if;

  update public.object_stage_conditions set
    is_done = p_done, value_text = coalesce(p_value, value_text),
    done_by = case when p_done then public.current_profile_id() end,
    done_at = case when p_done then now() end
  where id = p_condition_id;

  perform public.log_history(c.object_id, 'stage', c.stage_id, 'condition_set',
    format('Этап %s: условие «%s» — %s', c.stage_label, c.title, case when p_done then 'выполнено' else 'снята отметка' end));
end $$;

create or replace function public.stage_step_complete(p_step_id uuid, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare st record; v_next uuid;
begin
  select ss.*, s.object_id, coalesce(s.code, s.number::text) as stage_label into st
  from public.object_stage_steps ss join public.object_stages s on s.id = ss.stage_id where ss.id = p_step_id;
  if not found then raise exception 'Шаг не найден'; end if;
  if not public.can_see_object(st.object_id) then raise exception 'Нет прав'; end if;
  if st.state <> 'current' then raise exception 'Можно завершить только текущий шаг'; end if;

  update public.object_stage_steps set state = 'done', done_by = public.current_profile_id(),
         done_at = now(), comment = p_comment where id = p_step_id;
  select id into v_next from public.object_stage_steps
  where stage_id = st.stage_id and step_no > st.step_no order by step_no limit 1;
  if v_next is not null then
    update public.object_stage_steps set state = 'current' where id = v_next;
  end if;

  perform public.log_history(st.object_id, 'stage', st.stage_id, 'step_done',
    format('Этап %s: шаг %s «%s» выполнен', st.stage_label, st.step_no, st.action));
end $$;

create or replace function public.stage_set_excluded(p_stage_id uuid, p_excluded boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.object_stages;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  update public.object_stages set is_excluded = p_excluded where id = p_stage_id returning * into s;
  perform public.log_history(s.object_id, 'stage', s.id, 'excluded',
    format('Этап %s «%s» %s', coalesce(s.code, s.number::text), s.name,
      case when p_excluded then 'исключён из работы' else 'возвращён в работу' end));
end $$;

-- ---------------------------------------------------------------------
-- 10. Views (v_objects зависит от v_object_stages)
-- ---------------------------------------------------------------------
drop view if exists public.v_objects;
drop view if exists public.v_object_stages;

create view public.v_object_stages with (security_invoker = true) as
select s.*,
  st.name  as status_name, st.color as status_color, st.is_closed,
  wt.name  as work_type_name,
  e.full_name  as executor_name,
  ce.full_name as coexecutor_name,
  cr.name      as confirmer_role_name,
  cf.full_name as confirmer_name,
  p.code       as parent_code,
  p.name       as parent_name,
  (select count(*) from public.object_stage_conditions c where c.stage_id = s.id and c.deleted_at is null) as conditions_total,
  (select count(*) from public.object_stage_conditions c where c.stage_id = s.id and c.deleted_at is null and c.is_done) as conditions_done,
  (not st.is_closed and s.due_date is not null and s.due_date < public.msk_today()) as is_overdue,
  (not st.is_closed and s.due_date is not null and s.due_date >= public.msk_today()
     and s.due_date - coalesce(s.remind_days, 0) <= public.msk_today()) as is_due_soon,
  (not st.is_closed and s.response_due is not null and s.response_received_at is null
     and s.response_due < public.msk_today()) as is_no_response,
  (not st.is_closed and s.executor_id is null) as is_no_executor,
  case when not st.is_closed and s.due_date is not null then s.due_date - public.msk_today() end as days_left,
  (select ss.role_code from public.object_stage_steps ss where ss.stage_id = s.id and ss.state = 'current' limit 1) as current_step_role,
  (select ss.action    from public.object_stage_steps ss where ss.stage_id = s.id and ss.state = 'current' limit 1) as current_step_action
from public.object_stages s
join public.stage_statuses st on st.code = s.status_code
left join public.work_types wt on wt.id = s.work_type_id
left join public.profiles e  on e.id = s.executor_id
left join public.profiles ce on ce.id = s.coexecutor_id
left join public.roles cr    on cr.code = s.confirmer_role
left join public.profiles cf on cf.id = s.confirmer_id
left join public.object_stages p on p.id = s.parent_id and p.deleted_at is null
where s.deleted_at is null;

grant select on public.v_object_stages to authenticated, anon;

create view public.v_objects as
select o.*,
  c.name as customer_name,
  rp.full_name as responsible_name,
  cur.full_name as curator_name,
  tn.full_name as technadzor_name,
  te.full_name as technadzor_ehz_name,
  case when o.contract_end is not null then o.contract_end - public.msk_today() end as contract_days_left,
  agg.stages_total, agg.stages_closed,
  case when agg.stages_total > 0 then round(100.0 * agg.stages_closed / agg.stages_total) else 0 end as progress_pct,
  agg.stages_overdue, agg.stages_no_response, agg.stages_on_review, agg.stages_no_executor,
  cur_st.number as current_stage_number, cur_st.name as current_stage_name,
  coalesce(rq.requests_new, 0) as requests_new, coalesce(rq.requests_overdue, 0) as requests_overdue
from public.objects o
left join public.customers c on c.id = o.customer_id
left join public.profiles rp on rp.id = o.responsible_id
left join public.customer_contacts cur on cur.id = o.curator_contact_id
left join public.customer_contacts tn on tn.id = o.technadzor_contact_id
left join public.customer_contacts te on te.id = o.technadzor_ehz_contact_id
left join lateral (
  select count(*) filter (where true)                         as stages_total,
         count(*) filter (where v.is_closed)                  as stages_closed,
         count(*) filter (where v.is_overdue)                 as stages_overdue,
         count(*) filter (where v.is_no_response)             as stages_no_response,
         count(*) filter (where v.status_code = 'on_review')  as stages_on_review,
         count(*) filter (where v.is_no_executor)             as stages_no_executor
  from public.v_object_stages v where v.object_id = o.id and not v.is_excluded) agg on true
left join lateral (
  select v.number, v.name from public.v_object_stages v
  where v.object_id = o.id and not v.is_excluded and not v.is_closed
  order by v.sort, v.number limit 1) cur_st on true
left join lateral (
  select count(*) filter (where vr.is_new) as requests_new,
         count(*) filter (where vr.is_overdue) as requests_overdue
  from public.v_requests vr where vr.object_id = o.id) rq on true
where o.deleted_at is null and public.can_see_object(o.id);

grant select on public.v_objects to authenticated, anon;

create or replace view public.v_overdue
with (security_invoker = true)
as
select
  'request'::text as kind,
  r.id,
  r.object_id,
  o.name as object_name,
  format('Заявка №%s «%s»', r.number, r.type_name) as title,
  coalesce(rs.name, r.status) as status,
  rs.color as status_color,
  coalesce(om.full_name, i.full_name) as responsible,
  r.call_date as due_date,
  (public.msk_today() - r.call_date)::int as days,
  null::text as note
from public.requests r
join public.objects o
  on o.id = r.object_id
 and o.deleted_at is null
 and o.status <> 'completed'
left join public.request_statuses rs on rs.code = r.status
left join public.profiles i on i.id = r.initiator_id
left join public.profiles om on om.id = r.office_id
where r.deleted_at is null
  and r.status <> 'done'
  and r.call_date < public.msk_today()

union all

select
  'stage'::text as kind,
  s.id,
  s.object_id,
  o.name as object_name,
  format('Этап %s «%s»', coalesce(s.code, s.number::text), s.name) as title,
  st.name as status,
  st.color as status_color,
  e.full_name as responsible,
  s.due_date,
  (public.msk_today() - s.due_date)::int as days,
  s.note
from public.object_stages s
join public.objects o
  on o.id = s.object_id
 and o.deleted_at is null
 and o.status <> 'completed'
join public.stage_statuses st on st.code = s.status_code
left join public.profiles e on e.id = s.executor_id
where s.deleted_at is null
  and not s.is_excluded
  and not st.is_closed
  and s.due_date is not null
  and s.due_date < public.msk_today();

grant select on public.v_overdue to authenticated, anon;

-- ---------------------------------------------------------------------
-- 11. Backfill нумерации
-- ---------------------------------------------------------------------
do $$
declare oid uuid;
begin
  for oid in
    select distinct object_id from public.object_stages where deleted_at is null
  loop
    perform public.renumber_object_stages(oid);
  end loop;
end $$;
