-- Номер шаблона этапа: допускаем 1.1, 2.5 и т.п. (было int).
-- На объекте отобра номер — object_stages.code (text); при добавлении из справочника
-- берём номер шаблона как code, если свободен.

alter table public.stage_templates
  alter column number type numeric using number::numeric;

comment on column public.stage_templates.number is
  'Номер этапа в регламенте; допускается дробный (1.1)';

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
  v_tpl_code text;
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

    -- Номер из шаблона (в т.ч. 1.1), если ещё не занят на объекте.
    v_tpl_code := nullif(trim(both from t.number::text), '');
    if v_tpl_code is not null
       and not exists (
         select 1 from public.object_stages
         where object_id = p_object_id and deleted_at is null and code = v_tpl_code
       )
    then
      v_code := v_tpl_code;
      if v_tpl_code ~ '^[0-9]+$' then
        v_next := greatest(v_next, v_tpl_code::int);
      end if;
    else
      loop
        v_next := v_next + 1;
        v_code := v_next::text;
        exit when not exists (
          select 1 from public.object_stages
          where object_id = p_object_id and deleted_at is null and code = v_code
        );
      end loop;
    end if;

    v_sort := v_sort + 1;

    insert into public.object_stages(
      object_id, template_id, number, code, name, work_type_id, description,
      duration_days, confirmer_role, outgoing_doc, expected_doc, response_days, remind_days,
      is_critical, requires_id_folder_complete, sort, parent_id
    )
    values (
      p_object_id, t.id,
      case when v_code ~ '^[0-9]+$' then v_code::int else v_next + 1 end,
      v_code, t.name, t.work_type_id, t.description, t.duration_days,
      t.confirmer_role, t.outgoing_doc, t.expected_doc, t.response_days, t.remind_days,
      t.is_critical, coalesce(t.requires_id_folder_complete, false), v_sort, null
    )
    returning id into v_stage;

    if v_code ~ '^[0-9]+$' then
      v_next := greatest(v_next, v_code::int);
    else
      v_next := v_next + 1;
    end if;

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
