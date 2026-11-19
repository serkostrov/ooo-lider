-- Ускорение видимости: task-scoped роли зависали из‑за can_see_stage/object
-- на каждой строке (lookup этапа + stage_is_mine по всем этапам объекта).
-- Политики переводим на проверки колонок; хелперы — на index-friendly EXISTS.

-- ---------------------------------------------------------------------
-- 1. Индексы под «мои» назначения
-- ---------------------------------------------------------------------

create index if not exists object_stages_executor_id_idx
  on public.object_stages (executor_id)
  where deleted_at is null;

create index if not exists object_stages_coexecutor_id_idx
  on public.object_stages (coexecutor_id)
  where deleted_at is null;

create index if not exists object_stages_confirmer_id_idx
  on public.object_stages (confirmer_id)
  where deleted_at is null;

create index if not exists object_stage_steps_stage_role_idx
  on public.object_stage_steps (stage_id, role_code);

create index if not exists requests_initiator_id_idx
  on public.requests (initiator_id)
  where deleted_at is null;

create index if not exists requests_office_id_idx
  on public.requests (office_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------
-- 2. Хелперы без лишних self-lookup
-- ---------------------------------------------------------------------

create or replace function public.is_object_participant(p_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.objects o
      where o.id = p_object_id
        and o.deleted_at is null
        and o.responsible_id = public.current_profile_id()
    )
    or exists (
      select 1
      from public.object_members m
      where m.object_id = p_object_id
        and m.profile_id = public.current_profile_id()
    );
$$;

-- Чтение шагов без RLS (чтобы политика stages_sel не зацикливалась на steps_sel)
create or replace function public.stage_has_role_step(p_stage_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.object_stage_steps ss
    where ss.stage_id = p_stage_id
      and ss.role_code = p_role
  );
$$;

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
        or public.stage_has_role_step(s.id, public.current_role_code())
      )
  );
$$;

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
          and coalesce(t.name, r.type_name, '') ilike '%снабжен%'
        )
      )
  );
$$;

-- can_see_stage: для RLS stages_sel лучше смотреть колонки напрямую (см. политику ниже).
-- Функция остаётся для files/conditions/messages.
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

-- Объект для task-scoped: один EXISTS по назначениям, без stage_is_mine(id) на каждый этап
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
        select 1 from public.objects o
        where o.id = p_object_id and o.deleted_at is null
      )
      when not public.is_task_scoped_role() then
        public.is_object_participant(p_object_id)
      else
        exists (
          select 1
          from public.object_stages s
          where s.object_id = p_object_id
            and s.deleted_at is null
            and (
              s.executor_id = public.current_profile_id()
              or s.coexecutor_id = public.current_profile_id()
              or s.confirmer_id = public.current_profile_id()
              or public.stage_has_role_step(s.id, public.current_role_code())
            )
        )
        or exists (
          select 1
          from public.requests r
          left join public.request_types t on t.id = r.request_type_id
          where r.object_id = p_object_id
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
                and coalesce(t.name, r.type_name, '') ilike '%снабжен%'
              )
            )
        )
    end;
$$;

-- ---------------------------------------------------------------------
-- 3. Политики: без self-join через can_see_stage(id) на каждой строке
-- ---------------------------------------------------------------------

drop policy if exists stages_sel on public.object_stages;
create policy stages_sel on public.object_stages
  for select to authenticated
  using (
    public.is_admin()
    or (
      not public.is_task_scoped_role()
      and public.is_object_participant(object_id)
    )
    or (
      public.is_task_scoped_role()
      and (
        executor_id = public.current_profile_id()
        or coexecutor_id = public.current_profile_id()
        or confirmer_id = public.current_profile_id()
        or public.stage_has_role_step(id, public.current_role_code())
      )
    )
  );

drop policy if exists stages_upd on public.object_stages;
create policy stages_upd on public.object_stages
  for update to authenticated
  using (
    public.is_admin()
    or (
      not public.is_task_scoped_role()
      and public.is_object_participant(object_id)
    )
    or (
      public.is_task_scoped_role()
      and (
        executor_id = public.current_profile_id()
        or coexecutor_id = public.current_profile_id()
        or confirmer_id = public.current_profile_id()
        or public.stage_has_role_step(id, public.current_role_code())
      )
    )
  )
  with check (
    public.is_admin()
    or (
      not public.is_task_scoped_role()
      and public.is_object_participant(object_id)
    )
    or (
      public.is_task_scoped_role()
      and (
        executor_id = public.current_profile_id()
        or coexecutor_id = public.current_profile_id()
        or confirmer_id = public.current_profile_id()
        or public.stage_has_role_step(id, public.current_role_code())
      )
    )
  );

drop policy if exists requests_sel on public.requests;
create policy requests_sel on public.requests
  for select to authenticated
  using (
    public.is_admin()
    or (
      not public.is_task_scoped_role()
      and public.is_object_participant(object_id)
    )
    or (
      public.is_task_scoped_role()
      and (
        initiator_id = public.current_profile_id()
        or office_id = public.current_profile_id()
        or exists (
          select 1
          from public.request_type_scenario_steps s
          where s.request_type_id = requests.request_type_id
            and s.role_code = public.current_role_code()
        )
        or (
          public.current_role_code() = 'supply'
          and exists (
            select 1
            from public.request_types t
            where t.id = requests.request_type_id
              and coalesce(t.name, requests.type_name, '') ilike '%снабжен%'
          )
        )
      )
    )
  );

-- Условия / шаги / предшественники через can_see_stage (security definer — без рекурсии)
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

grant execute on function public.stage_has_role_step(uuid, text) to authenticated;
