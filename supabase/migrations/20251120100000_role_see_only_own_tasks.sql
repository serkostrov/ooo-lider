-- Видимость этапов/заявок настраивается в справочнике ролей.
-- see_only_own_tasks = true → только свои этапы и заявки (по умолчанию: прораб, бригадир).
-- Остальные роли видят все этапы/заявки объекта, на котором они участники.
-- Работа (статусы, шаги) по-прежнему ограничена сценарием и RPC, не этой галкой.

alter table public.roles
  add column if not exists see_only_own_tasks boolean not null default false;

comment on column public.roles.see_only_own_tasks is
  'Если true — пользователь с этой ролью видит только свои этапы и заявки. '
  'Если у профиля несколько ролей и хотя бы одна без этой галки — видит всё на объекте.';

-- Новые дефолты по ответу заказчика: ограничение только у прораба и бригадира.
update public.roles
set see_only_own_tasks = (code in ('foreman', 'brigadier'));

-- Узкая видимость: все роли профиля с флагом, и нет роли без флага.
create or replace function public.is_task_scoped_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not public.is_admin()
    and exists (
      select 1
      from public.roles r
      where r.code = any(public.current_role_codes())
        and r.see_only_own_tasks
    )
    and not exists (
      select 1
      from public.roles r
      where r.code = any(public.current_role_codes())
        and not r.see_only_own_tasks
    );
$$;

-- Объект: участник всегда видит объект; иначе — если есть своя работа
-- (этапы/заявки режутся отдельно через is_task_scoped_role).
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
      when public.is_object_participant(p_object_id) then true
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
              or public.stage_matches_my_roles(s.id)
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
                  and s.role_code = any(public.current_role_codes())
              )
              or (
                public.has_role('supply')
                and coalesce(t.name, r.type_name, '') ilike '%снабжен%'
              )
            )
        )
    end;
$$;
