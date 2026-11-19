-- Ручная нумерация этапов: DnD меняет только sort, code не пересчитывается.
-- Номер (code) задаётся вручную через set_object_stage_code.

-- ---------------------------------------------------------------------
-- 1. reorder — только порядок, без renumber
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
end $$;

revoke all on function public.reorder_object_stages(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_object_stages(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2. delete — не перенумеровывать оставшиеся
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

  perform public.log_history(s.object_id, 'stage', s.id, 'deleted',
    format('Этап %s «%s» удалён', coalesce(s.code, s.number::text), s.name));
end $$;

revoke all on function public.delete_object_stage(uuid) from public, anon;
grant execute on function public.delete_object_stage(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. add_object_substage — новый код/sort без пересчёта соседей
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
  v_code text;
  v_sort int;
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

  select coalesce(max(sort), 0) + 1 into v_sort
  from public.object_stages
  where parent_id = p_parent_id and deleted_at is null;

  v_k := 0;
  loop
    v_k := v_k + 1;
    v_code := coalesce(nullif(trim(v_parent.code), ''), v_parent.number::text) || '.' || v_k::text;
    exit when not exists (
      select 1 from public.object_stages
      where object_id = v_parent.object_id and deleted_at is null and code = v_code
    );
  end loop;

  insert into public.object_stages(
    object_id, parent_id, template_id, number, code, name, work_type_id, description,
    duration_days, confirmer_role, executor_id, is_critical, sort
  )
  values (
    v_parent.object_id, p_parent_id, null, v_parent.number,
    v_code, trim(p_name),
    coalesce(p_work_type_id, v_parent.work_type_id), p_description,
    p_duration_days, coalesce(p_confirmer_role, v_parent.confirmer_role),
    p_executor_id, false, v_sort
  )
  returning id into v_id;

  perform public.log_history(v_parent.object_id, 'stage', v_id, 'substage_added',
    format('Добавлен подэтап «%s» (%s) к этапу %s', trim(p_name), v_code, v_parent.code));
  return v_id;
end $$;

revoke all on function public.add_object_substage(uuid, text, text, uuid, int, text, uuid) from public, anon;
grant execute on function public.add_object_substage(uuid, text, text, uuid, int, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. add_object_stages — без renumber существующих
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
  v_sort int;
  v_code text;
  v_new_ids uuid[] := '{}';
  v_pred uuid;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select coalesce(max(number), 0) into v_next
  from public.object_stages
  where object_id = p_object_id and deleted_at is null and parent_id is null;

  select coalesce(max(sort), 0) into v_sort
  from public.object_stages
  where object_id = p_object_id and deleted_at is null and parent_id is null;

  foreach v_tid in array coalesce(p_template_ids, '{}')
  loop
    select * into t from public.stage_templates
    where id = v_tid and deleted_at is null;
    if not found then continue; end if;

    loop
      v_next := v_next + 1;
      v_code := v_next::text;
      exit when not exists (
        select 1 from public.object_stages
        where object_id = p_object_id and deleted_at is null and code = v_code
      );
    end loop;
    v_sort := v_sort + 1;

    insert into public.object_stages(
      object_id, template_id, number, code, name, work_type_id, description,
      duration_days, confirmer_role, outgoing_doc, expected_doc, response_days, remind_days,
      is_critical, requires_id_folder_complete, sort, parent_id
    )
    values (
      p_object_id, t.id, v_next, v_code, t.name, t.work_type_id, t.description, t.duration_days,
      t.confirmer_role, t.outgoing_doc, t.expected_doc, t.response_days, t.remind_days,
      t.is_critical, coalesce(t.requires_id_folder_complete, false), v_sort, null
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

  if v_count > 0 then
    perform public.log_history(p_object_id, 'object', p_object_id, 'stages_added',
      format('Добавлено этапов: %s', v_count), jsonb_build_object('template_ids', p_template_ids));
  end if;
  return v_count;
end $$;

grant execute on function public.add_object_stages(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 5. set_object_stage_code — ручной номер
-- ---------------------------------------------------------------------
create or replace function public.set_object_stage_code(p_stage_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.object_stages;
  v_code text;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select * into s from public.object_stages where id = p_stage_id and deleted_at is null;
  if not found then raise exception 'Этап не найден'; end if;

  v_code := trim(coalesce(p_code, ''));
  if v_code = '' then raise exception 'Укажите номер'; end if;
  if length(v_code) > 32 then raise exception 'Номер слишком длинный'; end if;

  if exists (
    select 1 from public.object_stages
    where object_id = s.object_id
      and deleted_at is null
      and id <> p_stage_id
      and code = v_code
  ) then
    raise exception 'Номер «%» уже занят на этом объекте', v_code;
  end if;

  update public.object_stages
  set
    code = v_code,
    number = case
      when s.parent_id is null and v_code ~ '^[0-9]+$' then v_code::int
      else number
    end
  where id = p_stage_id;

  perform public.log_history(s.object_id, 'stage', s.id, 'code_changed',
    format('Номер этапа изменён: %s → %s', coalesce(s.code, s.number::text), v_code));
end $$;

revoke all on function public.set_object_stage_code(uuid, text) from public, anon;
grant execute on function public.set_object_stage_code(uuid, text) to authenticated;
