-- =====================================================================
-- Нумерация этапов индивидуальна для каждого объекта: 1…n по порядку.
-- Номера из справочника на объект больше не копируются.
-- =====================================================================

create or replace function public.renumber_object_stages(p_object_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Два прохода: сначала отрицательные, чтобы не пересечься с текущими номерами.
  with ordered as (
    select id, row_number() over (order by sort, number, created_at) as rn
    from public.object_stages
    where object_id = p_object_id and deleted_at is null
  )
  update public.object_stages s
  set number = -o.rn, sort = -o.rn
  from ordered o
  where s.id = o.id;

  update public.object_stages
  set number = -number, sort = -sort
  where object_id = p_object_id and deleted_at is null and number < 0;
end $$;

revoke all on function public.renumber_object_stages(uuid) from public, anon, authenticated;

create or replace function public.add_object_stages(p_object_id uuid, p_template_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  t record; v_stage uuid; v_count int := 0; v_first int; v_next int;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select coalesce(max(number), 0) into v_next
  from public.object_stages
  where object_id = p_object_id and deleted_at is null;

  for t in select * from public.stage_templates
           where id = any(p_template_ids) and deleted_at is null
             and not exists (select 1 from public.object_stages s
                             where s.object_id = p_object_id and s.template_id = stage_templates.id
                               and s.deleted_at is null)
           order by sort, number
  loop
    v_next := v_next + 1;
    insert into public.object_stages(object_id, template_id, number, name, work_type_id, description,
      duration_days, confirmer_role, outgoing_doc, expected_doc, response_days, remind_days,
      is_critical, sort)
    values (p_object_id, t.id, v_next, t.name, t.work_type_id, t.description, t.duration_days,
      t.confirmer_role, t.outgoing_doc, t.expected_doc, t.response_days, t.remind_days,
      t.is_critical, v_next)
    returning id into v_stage;

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

  insert into public.object_stage_predecessors(stage_id, predecessor_id)
  select s.id, sp.id
  from public.object_stages s
  join public.stage_template_predecessors tp on tp.template_id = s.template_id
  join public.object_stages sp on sp.template_id = tp.predecessor_id and sp.object_id = s.object_id
  where s.object_id = p_object_id and s.deleted_at is null and sp.deleted_at is null
  on conflict do nothing;

  perform public.renumber_object_stages(p_object_id);

  if v_count > 0 then
    perform public.log_history(p_object_id, 'object', p_object_id, 'stages_added',
      format('Добавлено этапов: %s', v_count), jsonb_build_object('template_ids', p_template_ids));
  end if;
  return v_count;
end $$;

-- Один раз привести уже созданные объекты к сплошной нумерации 1…n
do $$
declare oid uuid;
begin
  for oid in
    select distinct object_id from public.object_stages where deleted_at is null
  loop
    perform public.renumber_object_stages(oid);
  end loop;
end $$;
