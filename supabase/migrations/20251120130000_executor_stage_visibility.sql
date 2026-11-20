-- Назначение на этап (исполнитель/соисполнитель/принимающий) должно:
-- 1) давать видеть этот этап даже без object_members;
-- 2) добавлять человека в участники объекта (иначе «нет этапов» и нет уведомлений
--    из v_notification_events с security_invoker + join на object_stages).

-- ---------------------------------------------------------------------
-- 1. Хелпер: «я назначен на этап»
-- ---------------------------------------------------------------------
create or replace function public.stage_assignment_is_mine(p_stage_id uuid)
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
      )
  );
$$;

grant execute on function public.stage_assignment_is_mine(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. can_see_stage: участник объекта ИЛИ своё назначение ИЛИ task-scoped mine
-- ---------------------------------------------------------------------
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
      when public.stage_assignment_is_mine(p_stage_id) then true
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

-- ---------------------------------------------------------------------
-- 3. Политики этапов: назначение видно всегда; участнику без see_only_own — все этапы
-- ---------------------------------------------------------------------
drop policy if exists stages_sel on public.object_stages;
create policy stages_sel on public.object_stages
  for select to authenticated
  using (
    public.is_admin()
    or executor_id = public.current_profile_id()
    or coexecutor_id = public.current_profile_id()
    or confirmer_id = public.current_profile_id()
    or (
      not public.is_task_scoped_role()
      and public.is_object_participant(object_id)
    )
    or (
      public.is_task_scoped_role()
      and public.stage_matches_my_roles(id)
    )
  );

drop policy if exists stages_upd on public.object_stages;
create policy stages_upd on public.object_stages
  for update to authenticated
  using (
    public.is_admin()
    or executor_id = public.current_profile_id()
    or coexecutor_id = public.current_profile_id()
    or confirmer_id = public.current_profile_id()
    or (
      not public.is_task_scoped_role()
      and public.is_object_participant(object_id)
    )
    or (
      public.is_task_scoped_role()
      and public.stage_matches_my_roles(id)
    )
  )
  with check (
    public.is_admin()
    or executor_id = public.current_profile_id()
    or coexecutor_id = public.current_profile_id()
    or confirmer_id = public.current_profile_id()
    or (
      not public.is_task_scoped_role()
      and public.is_object_participant(object_id)
    )
    or (
      public.is_task_scoped_role()
      and public.stage_matches_my_roles(id)
    )
  );

-- ---------------------------------------------------------------------
-- 4. Автодобавление в object_members при назначении на этап
-- ---------------------------------------------------------------------
create or replace function public.ensure_object_member(p_object_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_object_id is null or p_profile_id is null then
    return;
  end if;
  insert into public.object_members (object_id, profile_id)
  values (p_object_id, p_profile_id)
  on conflict (object_id, profile_id) do nothing;
end;
$$;

create or replace function public.object_stages_sync_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_object_member(new.object_id, new.executor_id);
  perform public.ensure_object_member(new.object_id, new.coexecutor_id);
  perform public.ensure_object_member(new.object_id, new.confirmer_id);
  return new;
end;
$$;

drop trigger if exists object_stages_sync_members_trg on public.object_stages;
create trigger object_stages_sync_members_trg
  after insert or update of executor_id, coexecutor_id, confirmer_id
  on public.object_stages
  for each row
  execute function public.object_stages_sync_members();

-- Бэкфилл: текущие назначения → участники
insert into public.object_members (object_id, profile_id)
select distinct s.object_id, x.profile_id
from public.object_stages s
cross join lateral (
  values (s.executor_id), (s.coexecutor_id), (s.confirmer_id)
) as x(profile_id)
where s.deleted_at is null
  and x.profile_id is not null
  and not exists (
    select 1 from public.object_members m
    where m.object_id = s.object_id and m.profile_id = x.profile_id
  );
