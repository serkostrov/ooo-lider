-- Несколько ролей на одного сотрудника (например сметчик + снабжение).
-- profiles.role_code остаётся «основной» для совместимости; полный набор — profile_roles.

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_code  text not null references public.roles(code),
  created_at timestamptz not null default now(),
  primary key (profile_id, role_code)
);

create index if not exists profile_roles_role_code_idx on public.profile_roles (role_code);

insert into public.profile_roles (profile_id, role_code)
select p.id, p.role_code
from public.profiles p
where p.role_code is not null
on conflict do nothing;

alter table public.profile_roles enable row level security;

drop policy if exists profile_roles_sel on public.profile_roles;
create policy profile_roles_sel on public.profile_roles
  for select to authenticated
  using (true);

drop policy if exists profile_roles_adm on public.profile_roles;
create policy profile_roles_adm on public.profile_roles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Хелперы ролей
-- ---------------------------------------------------------------------

create or replace function public.current_role_codes()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array(
      select pr.role_code
      from public.profile_roles pr
      where pr.profile_id = public.current_profile_id()
      order by pr.role_code
    ),
    case
      when public.current_role_code() is null then '{}'::text[]
      else array[public.current_role_code()]
    end
  );
$$;

create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_role is not null
    and (
      p_role = any(public.current_role_codes())
      or exists (
        select 1
        from public.profiles p
        where p.id = public.current_profile_id()
          and p.deleted_at is null
          and p.role_code = p_role
      )
    );
$$;

create or replace function public.has_any_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from unnest(coalesce(p_roles, '{}'::text[])) r(code)
    where public.has_role(r.code)
  );
$$;

-- Совпадение со шагом сценария: любая роль пользователя
create or replace function public.role_matches_scenario(p_my_role text, p_step_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_step_role is null then false
    when public.has_role(p_step_role) then true
    when p_step_role in ('foreman', 'pto')
      and (public.has_role('foreman') or public.has_role('pto')) then true
    -- fallback на переданный код (старые вызовы / сервисы)
    when p_my_role is not distinct from p_step_role then true
    when p_step_role in ('foreman', 'pto') and p_my_role in ('foreman', 'pto') then true
    else false
  end;
$$;

-- Узкая видимость только если нет «объектных» ролей (прораб/ПТО/офис/админ).
-- Сметчик+снабжение → task-scoped; прораб+сметчик → весь объект как у прораба.
create or replace function public.is_task_scoped_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not public.is_admin()
    and not public.has_role('foreman')
    and not public.has_role('pto')
    and not public.has_role('office')
    and (
      public.current_role_codes() && array['estimator', 'brigadier', 'supply']::text[]
      or coalesce(public.current_role_code(), '') in ('estimator', 'brigadier', 'supply')
    );
$$;

-- Этап «мой» по любой из ролей пользователя в шагах сценария
create or replace function public.stage_matches_my_roles(p_stage_id uuid)
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
      and ss.role_code = any(public.current_role_codes())
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
        or public.stage_matches_my_roles(s.id)
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
            and s.role_code = any(public.current_role_codes())
        )
        or (
          public.has_role('supply')
          and coalesce(t.name, r.type_name, '') ilike '%снабжен%'
        )
      )
  );
$$;

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

-- Политики этапов/заявок: любая роль пользователя
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
        or public.stage_matches_my_roles(id)
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
        or public.stage_matches_my_roles(id)
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
        or public.stage_matches_my_roles(id)
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
            and s.role_code = any(public.current_role_codes())
        )
        or (
          public.has_role('supply')
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

-- adhoc: любая из ролей foreman/pto
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
    or public.has_role('foreman')
    or public.has_role('pto')
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

-- Атомарная запись ролей сотрудника
create or replace function public.set_profile_roles(p_profile_id uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles text[];
  v_primary text;
begin
  if not public.is_admin() then
    raise exception 'Нет прав';
  end if;
  if p_profile_id is null then
    raise exception 'Не указан сотрудник';
  end if;

  select array_agg(distinct r order by r)
  into v_roles
  from unnest(coalesce(p_roles, '{}'::text[])) r
  where nullif(trim(r), '') is not null;

  if v_roles is null or cardinality(v_roles) = 0 then
    raise exception 'Укажите хотя бы одну роль';
  end if;

  if exists (
    select 1 from unnest(v_roles) x(code)
    where not exists (select 1 from public.roles r where r.code = x.code)
  ) then
    raise exception 'Неизвестная роль';
  end if;

  -- основная: admin/director приоритетнее, иначе первая по sort справочника
  select r.code into v_primary
  from public.roles r
  where r.code = any(v_roles)
  order by
    case when r.is_admin then 0 else 1 end,
    r.sort,
    r.code
  limit 1;

  delete from public.profile_roles where profile_id = p_profile_id;
  insert into public.profile_roles(profile_id, role_code)
  select p_profile_id, x.code from unnest(v_roles) x(code);

  update public.profiles
  set role_code = v_primary, updated_at = now()
  where id = p_profile_id;
end $$;

grant execute on function public.current_role_codes() to authenticated;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.stage_matches_my_roles(uuid) to authenticated;
grant execute on function public.set_profile_roles(uuid, text[]) to authenticated;

-- RPC: проверки ролей через has_role
CREATE OR REPLACE FUNCTION public.stage_step_complete(p_step_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare st record; v_next uuid; v_me uuid; v_my_role text; v_is_admin boolean;
begin
  select ss.*, s.object_id, s.is_excluded, stt.is_closed,
         coalesce(s.code, s.number::text) as stage_label into st
  from public.object_stage_steps ss
  join public.object_stages s on s.id = ss.stage_id
  join public.stage_statuses stt on stt.code = s.status_code
  where ss.id = p_step_id;
  if not found then raise exception 'Шаг не найден'; end if;
  if not public.can_see_object(st.object_id) then raise exception 'Нет прав'; end if;
  if st.is_excluded or st.is_closed then raise exception 'Этап закрыт или исключён'; end if;
  if st.state <> 'current' then raise exception 'Можно завершить только текущий шаг'; end if;

  v_me := public.current_profile_id();
  v_is_admin := public.is_admin();
  if not v_is_admin and not public.has_role(st.role_code) then
    raise exception 'Этот шаг выполняет роль «%»', st.role_code;
  end if;

  update public.object_stage_steps set state = 'done', done_by = v_me,
         done_at = now(), comment = p_comment where id = p_step_id;
  select id into v_next from public.object_stage_steps
  where stage_id = st.stage_id and step_no > st.step_no order by step_no limit 1;
  if v_next is not null then
    update public.object_stage_steps set state = 'current' where id = v_next;
  end if;

  perform public.log_history(st.object_id, 'stage', st.stage_id, 'step_done',
    format('Этап %s: шаг %s «%s» выполнен', st.stage_label, st.step_no, st.action));
end $function$


CREATE OR REPLACE FUNCTION public.request_create(p_object_id uuid, p_request_type_id uuid, p_call_date date, p_values jsonb DEFAULT '[]'::jsonb, p_representative_id uuid DEFAULT NULL::uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; t public.request_types; v_number bigint;
        v_my_role text; v_is_admin boolean;
begin
  if not public.can_see_object(p_object_id) then raise exception 'Нет прав'; end if;

  v_is_admin := public.is_admin();
  if not v_is_admin and not (public.has_role('foreman') or public.has_role('pto')) then
    raise exception 'Создавать заявки могут прораб, ПТО или администратор';
  end if;

  select * into t from public.request_types where id = p_request_type_id and deleted_at is null and is_active;
  if not found then raise exception 'Вид заявки не найден'; end if;
  if p_call_date is null then raise exception 'Укажите дату вызова'; end if;
  if t.uses_representatives and p_representative_id is null then raise exception 'Выберите, кого вызываем'; end if;

  insert into public.requests(object_id, request_type_id, type_name, representative_id, stage_id,
                              initiator_id, call_date)
  values (p_object_id, t.id, t.name, p_representative_id, p_stage_id, public.current_profile_id(), p_call_date)
  returning id, number into v_id, v_number;

  perform public.request_save_values(v_id, p_values);

  perform public.log_history(p_object_id, 'request', v_id, 'created',
    format('Заявка №%s «%s» создана, вызов на %s', v_number, t.name, to_char(p_call_date, 'DD.MM.YYYY')));
  return v_id;
end $function$


CREATE OR REPLACE FUNCTION public.request_set_status(p_request_id uuid, p_status text, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.requests;
        v_order text[] := array['new','ready','sent','accepted','done'];
        v_from int; v_to int; v_missing int;
        v_names jsonb := '{"new":"Новая","ready":"Готова к отправке","sent":"Отправлена","accepted":"Принята заказчиком","done":"Исполнена","rework":"Требует доработки"}';
        v_name text;
        v_step record;
        v_my_role text;
        v_is_admin boolean;
        v_to_rework boolean := false;
        v_from_rework boolean := false;
        v_linear_forward boolean := false;
        v_linear_back boolean := false;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;

  if p_status = r.status then return; end if;

  if p_status not in ('new','ready','sent','accepted','done','rework') then
    raise exception 'Неизвестный статус %', p_status;
  end if;
  if r.status not in ('new','ready','sent','accepted','done','rework') then
    raise exception 'Текущий статус % отсутствует в справочнике', r.status;
  end if;

  v_from := array_position(v_order, r.status);
  v_to   := array_position(v_order, p_status);

  v_to_rework := (p_status = 'rework');
  v_from_rework := (r.status = 'rework');
  v_linear_forward := (v_from is not null and v_to is not null and v_to = v_from + 1);
  v_linear_back := (v_from is not null and v_to is not null and v_to < v_from);

  if v_to_rework then
    if r.status not in ('ready','sent','accepted') then
      raise exception 'На доработку можно вернуть только из «Готова», «Отправлена» или «Принята»';
    end if;
    if coalesce(trim(p_comment), '') = '' then
      raise exception 'Укажите причину доработки';
    end if;
  elsif v_from_rework then
    if p_status <> 'ready' then
      raise exception 'Из «Требует доработки» заявка возвращается только в «Готова к отправке»';
    end if;
  elsif v_linear_forward then
    null;
  elsif v_linear_back then
    if p_status = 'new' then
      raise exception 'Вернуть в «Новая» нельзя — отправьте заявку на доработку';
    end if;
    if coalesce(trim(p_comment), '') = '' then
      raise exception 'Укажите причину возврата';
    end if;
  else
    raise exception 'Недопустимый переход статуса';
  end if;

  v_is_admin := public.is_admin();
  -- multi-role: проверки через has_role / role_matches_scenario

  if v_to_rework then
    if not v_is_admin and not public.has_role('office') then
      raise exception 'На доработку отправляет офис-менеджер';
    end if;
  elsif v_from_rework and p_status = 'ready' then
    select s.* into v_step
    from public.request_type_scenario_steps s
    where s.request_type_id = r.request_type_id
      and s.to_status = 'ready'
      and s.deleted_at is null
    order by s.step_no
    limit 1;
    if found and not v_is_admin and not public.role_matches_scenario(v_my_role, v_step.role_code) then
      raise exception 'Этот шаг выполняет роль «%»', v_step.role_code;
    end if;
    if not found and not v_is_admin and not (public.has_role('foreman') or public.has_role('pto')) then
      raise exception 'Из доработки в «Готова» переводит прораб или ПТО';
    end if;
  elsif v_linear_forward then
    select s.* into v_step
    from public.request_type_scenario_steps s
    where s.request_type_id = r.request_type_id
      and s.to_status = p_status
      and s.deleted_at is null
    order by s.step_no
    limit 1;

    if found and not v_is_admin and not public.role_matches_scenario(v_my_role, v_step.role_code) then
      raise exception 'Этот шаг выполняет роль «%»', v_step.role_code;
    end if;

    -- Нет шага сценария: ready → прораб/ПТО, дальше → офис
    if not found and not v_is_admin then
      if p_status = 'ready' and not (public.has_role('foreman') or public.has_role('pto')) then
        raise exception 'В «Готова к отправке» переводит прораб или ПТО';
      end if;
      if p_status <> 'ready' and not public.has_role('office') then
        raise exception 'Этот переход выполняет офис-менеджер';
      end if;
    end if;

    if found then
      select count(*) into v_missing
      from public.request_type_scenario_step_fields sf
      join public.request_type_fields f on f.id = sf.field_id
      where sf.step_id = v_step.id
        and f.is_active and f.deleted_at is null
        and not exists (
          select 1 from public.request_field_values fv
          where fv.request_id = r.id and fv.field_id = f.id
            and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb
        )
        and not (f.field_type = 'file' and exists (
          select 1 from public.files fl
          where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null
        ));
      if v_missing > 0 then
        raise exception 'Заполните обязательные поля шага: %', v_missing;
      end if;
    end if;
  elsif v_linear_back then
    if not v_is_admin and not public.has_role('office') then
      raise exception 'Нет прав на возврат статуса';
    end if;
  end if;

  if p_status = 'ready' and (v_linear_forward or v_from_rework) then
    select count(*) into v_missing
    from public.request_type_fields f
    where f.request_type_id = r.request_type_id
      and f.is_active and f.deleted_at is null and f.is_required
      and f.filled_by = 'initiator'
      and not exists (
        select 1 from public.request_field_values fv
        where fv.request_id = r.id and fv.field_id = f.id
          and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb
      )
      and not (f.field_type = 'file' and exists (
        select 1 from public.files fl
        where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null
      ));
    if v_missing > 0 then raise exception 'Заполните обязательные поля: %', v_missing; end if;

    if v_from_rework then
      select s.* into v_step
      from public.request_type_scenario_steps s
      where s.request_type_id = r.request_type_id
        and s.to_status = 'ready'
        and s.deleted_at is null
      order by s.step_no
      limit 1;
      if found then
        select count(*) into v_missing
        from public.request_type_scenario_step_fields sf
        join public.request_type_fields f on f.id = sf.field_id
        where sf.step_id = v_step.id
          and f.is_active and f.deleted_at is null
          and not exists (
            select 1 from public.request_field_values fv
            where fv.request_id = r.id and fv.field_id = f.id
              and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb
          )
          and not (f.field_type = 'file' and exists (
            select 1 from public.files fl
            where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null
          ));
        if v_missing > 0 then
          raise exception 'Заполните обязательные поля шага: %', v_missing;
        end if;
      end if;
    end if;
  end if;

  if p_status = 'sent' and v_linear_forward then
    select count(*) into v_missing
    from public.request_type_fields f
    where f.request_type_id = r.request_type_id
      and f.is_active and f.deleted_at is null and f.is_required
      and f.filled_by in ('initiator','office')
      and not exists (
        select 1 from public.request_field_values fv
        where fv.request_id = r.id and fv.field_id = f.id
          and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb
      )
      and not (f.field_type = 'file' and exists (
        select 1 from public.files fl
        where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null
      ));
    if v_missing > 0 then raise exception 'Заполните обязательные поля: %', v_missing; end if;
  end if;

  perform set_config('lider.rpc', 'on', true);
  update public.requests set
    status      = p_status,
    office_id   = case
      when p_status = 'ready' and office_id is null and not v_from_rework
        then public.current_profile_id()
      else office_id
    end,
    sent_at     = case
      when p_status = 'sent' then now()
      when v_to_rework or (v_to is not null and v_to < 3) or v_from_rework then null
      else sent_at
    end,
    accepted_at = case
      when p_status = 'accepted' then now()
      when v_to_rework or (v_to is not null and v_to < 4) or v_from_rework then null
      else accepted_at
    end,
    done_at     = case when p_status = 'done' then now() else null end,
    done_by     = case when p_status = 'done' then public.current_profile_id() else null end,
    result_text = case when p_status = 'done' and p_comment is not null then p_comment else result_text end,
    seen_at     = case when p_status in ('new','rework') then null else coalesce(seen_at, now()) end
  where id = r.id;

  if p_comment is not null and p_comment <> '' then
    insert into public.request_comments(request_id, author_id, text)
    values (r.id, public.current_profile_id(), p_comment);
  end if;

  select coalesce((select s.name from public.request_statuses s where s.code = p_status), v_names->>p_status) into v_name;
  perform public.log_history(r.object_id, 'request', r.id, 'status_changed',
    format('Заявка №%s «%s»: %s', r.number, r.type_name, v_name),
    jsonb_build_object('from', r.status, 'to', p_status));
end $function$

