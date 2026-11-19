-- Видимость по ролям:
-- task-scoped (estimator, brigadier, supply) — только свои этапы/заявки и объекты с такой работой.
-- Остальные (foreman, pto, office, admin) — как раньше на уровне объекта.

-- ---------------------------------------------------------------------
-- 1. Хелперы
-- ---------------------------------------------------------------------

create or replace function public.current_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role_code
  from public.profiles p
  where p.id = public.current_profile_id()
    and p.deleted_at is null
  limit 1;
$$;

create or replace function public.is_task_scoped_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_code(), '') in ('estimator', 'brigadier', 'supply');
$$;

create or replace function public.is_object_participant(p_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.objects o
    where o.id = p_object_id
      and o.deleted_at is null
      and (
        o.responsible_id = public.current_profile_id()
        or exists (
          select 1
          from public.object_members m
          where m.object_id = o.id
            and m.profile_id = public.current_profile_id()
        )
      )
  );
$$;

-- «Свой» этап без рекурсии в can_see_object
create or replace function public.stage_is_mine(p_stage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.object_stages s
    where s.id = p_stage_id
      and s.deleted_at is null
      and (
        s.executor_id = public.current_profile_id()
        or s.coexecutor_id = public.current_profile_id()
        or s.confirmer_id = public.current_profile_id()
        or exists (
          select 1
          from public.object_stage_steps ss
          where ss.stage_id = s.id
            and ss.role_code = public.current_role_code()
        )
      )
  );
$$;

-- «Своя» заявка
create or replace function public.request_is_mine(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.requests r
    left join public.request_types t on t.id = r.request_type_id
    where r.id = p_request_id
      and r.deleted_at is null
      and (
        r.initiator_id = public.current_profile_id()
        or r.office_id = public.current_profile_id()
        or exists (
          select 1
          from public.request_type_scenario_steps s
          where s.request_type_id = r.request_type_id
            and s.role_code = public.current_role_code()
        )
        or (
          public.current_role_code() = 'supply'
          and (
            coalesce(t.name, r.type_name, '') ilike '%снабжен%'
          )
        )
      )
  );
$$;

create or replace function public.can_see_stage(p_stage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.is_admin() then true
      when not public.is_task_scoped_role() then exists (
        select 1
        from public.object_stages s
        where s.id = p_stage_id
          and s.deleted_at is null
          and public.is_object_participant(s.object_id)
      )
      else public.stage_is_mine(p_stage_id)
    end;
$$;

create or replace function public.can_see_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.is_admin() then true
      when not public.is_task_scoped_role() then exists (
        select 1
        from public.requests r
        where r.id = p_request_id
          and r.deleted_at is null
          and public.is_object_participant(r.object_id)
      )
      else public.request_is_mine(p_request_id)
    end;
$$;

-- Объект: для task-scoped — только если есть своя работа
create or replace function public.can_see_object(p_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.is_admin() then exists (
        select 1 from public.objects o where o.id = p_object_id and o.deleted_at is null
      )
      when not public.is_task_scoped_role() then public.is_object_participant(p_object_id)
      else exists (
        select 1
        from public.objects o
        where o.id = p_object_id
          and o.deleted_at is null
          and (
            exists (
              select 1
              from public.object_stages s
              where s.object_id = o.id
                and s.deleted_at is null
                and public.stage_is_mine(s.id)
            )
            or exists (
              select 1
              from public.requests r
              where r.object_id = o.id
                and r.deleted_at is null
                and public.request_is_mine(r.id)
            )
          )
      )
    end;
$$;

grant execute on function public.current_role_code() to authenticated;
grant execute on function public.is_task_scoped_role() to authenticated;
grant execute on function public.is_object_participant(uuid) to authenticated;
grant execute on function public.stage_is_mine(uuid) to authenticated;
grant execute on function public.request_is_mine(uuid) to authenticated;
grant execute on function public.can_see_stage(uuid) to authenticated;
grant execute on function public.can_see_request(uuid) to authenticated;
grant execute on function public.can_see_object(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Политики select / update
-- ---------------------------------------------------------------------

drop policy if exists stages_sel on public.object_stages;
create policy stages_sel on public.object_stages
  for select to authenticated
  using (public.can_see_stage(id));

drop policy if exists stages_upd on public.object_stages;
create policy stages_upd on public.object_stages
  for update to authenticated
  using (public.can_see_stage(id))
  with check (public.can_see_stage(id));

drop policy if exists stage_pred_sel on public.object_stage_predecessors;
create policy stage_pred_sel on public.object_stage_predecessors
  for select to authenticated
  using (public.can_see_stage(stage_id));

drop policy if exists stage_cond_sel on public.object_stage_conditions;
create policy stage_cond_sel on public.object_stage_conditions
  for select to authenticated
  using (public.can_see_stage(stage_id));

drop policy if exists stage_steps_sel on public.object_stage_steps;
create policy stage_steps_sel on public.object_stage_steps
  for select to authenticated
  using (public.can_see_stage(stage_id));

drop policy if exists requests_sel on public.requests;
create policy requests_sel on public.requests
  for select to authenticated
  using (public.can_see_request(id));

drop policy if exists req_values_sel on public.request_field_values;
create policy req_values_sel on public.request_field_values
  for select to authenticated
  using (public.can_see_request(request_id));

drop policy if exists req_comments_sel on public.request_comments;
create policy req_comments_sel on public.request_comments
  for select to authenticated
  using (public.can_see_request(request_id));

drop policy if exists req_comments_ins on public.request_comments;
create policy req_comments_ins on public.request_comments
  for insert to authenticated
  with check (
    author_id = public.current_profile_id()
    and public.can_see_request(request_id)
  );

drop policy if exists files_sel on public.files;
create policy files_sel on public.files
  for select to authenticated
  using (
    case entity_type
      when 'stage' then public.can_see_stage(entity_id)
      when 'stage_condition' then exists (
        select 1
        from public.object_stage_conditions c
        where c.id = entity_id
          and public.can_see_stage(c.stage_id)
      )
      when 'request' then public.can_see_request(entity_id)
      when 'request_field' then public.can_see_request(entity_id)
      else public.can_see_object(object_id)
    end
  );

drop policy if exists files_ins on public.files;
create policy files_ins on public.files
  for insert to authenticated
  with check (
    uploaded_by = public.current_profile_id()
    and case entity_type
      when 'stage' then public.can_see_stage(entity_id)
      when 'stage_condition' then exists (
        select 1
        from public.object_stage_conditions c
        where c.id = entity_id
          and public.can_see_stage(c.stage_id)
      )
      when 'request' then public.can_see_request(entity_id)
      when 'request_field' then public.can_see_request(entity_id)
      else public.can_see_object(object_id)
    end
  );

drop policy if exists stage_messages_select on public.stage_messages;
create policy stage_messages_select on public.stage_messages
  for select to authenticated
  using (deleted_at is null and public.can_see_stage(stage_id));

-- Сообщения: писать только если этап виден
create or replace function public.can_post_stage_message(p_stage_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_profile_id();
  s public.object_stages;
begin
  if v_me is null then return false; end if;
  if public.is_admin() then return true; end if;

  select * into s from public.object_stages where id = p_stage_id and deleted_at is null;
  if not found then return false; end if;
  if not public.can_see_stage(p_stage_id) then return false; end if;

  return (
    s.executor_id = v_me
    or s.coexecutor_id = v_me
    or s.confirmer_id = v_me
    or exists (
      select 1 from public.object_members m
      where m.object_id = s.object_id and m.profile_id = v_me
    )
    or exists (
      select 1 from public.objects o
      where o.id = s.object_id and o.responsible_id = v_me and o.deleted_at is null
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Adhoc: только admin / foreman / pto
-- ---------------------------------------------------------------------

create or replace function public.add_object_adhoc_stage(
  p_object_id uuid,
  p_name text,
  p_description text default null,
  p_executor_id uuid default null,
  p_duration_days int default null,
  p_work_type_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_profile_id();
  v_role text := public.current_role_code();
  v_id uuid;
  v_next int;
  v_sort int;
  v_code text;
  v_name text := trim(coalesce(p_name, ''));
  v_executor uuid;
begin
  if v_me is null then raise exception 'Нет профиля'; end if;
  if not (
    public.is_admin()
    or v_role in ('foreman', 'pto')
  ) then
    raise exception 'Нет прав добавлять работу вне регламента';
  end if;
  if not public.is_admin() and not public.is_object_participant(p_object_id) then
    raise exception 'Нет доступа к объекту';
  end if;
  if v_name = '' then raise exception 'Укажите название работы'; end if;

  v_executor := coalesce(p_executor_id, v_me);

  select coalesce(max(number), 0) into v_next
  from public.object_stages
  where object_id = p_object_id and deleted_at is null and parent_id is null;

  select coalesce(max(sort), 0) into v_sort
  from public.object_stages
  where object_id = p_object_id and deleted_at is null and parent_id is null;

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
    object_id, template_id, parent_id, number, code, name, description,
    work_type_id, duration_days, executor_id, is_critical, is_adhoc, sort
  )
  values (
    p_object_id, null, null, v_next, v_code, v_name, nullif(trim(coalesce(p_description, '')), ''),
    p_work_type_id, p_duration_days, v_executor, false, true, v_sort
  )
  returning id into v_id;

  perform public.log_history(
    p_object_id, 'stage', v_id, 'adhoc_added',
    format('Добавлена работа вне регламента «%s» (%s)', v_name, v_code),
    jsonb_build_object('name', v_name, 'code', v_code)
  );
  return v_id;
end $$;
