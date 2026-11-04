-- =====================================================================
-- Сценарий заявки: кто переводит на какой статус и какие поля обязательны
-- (созвон 27.10.2026). Цепочка статусов фиксирована; сценарий задаёт роли/поля.
-- =====================================================================

create table if not exists public.request_type_scenario_steps (
  id               uuid primary key default gen_random_uuid(),
  request_type_id  uuid not null references public.request_types(id) on delete cascade,
  step_no          int not null check (step_no >= 1),
  role_code        text not null references public.roles(code),
  -- Статус, НА который переходит заявка на этом шаге (кнопка «следующий»)
  to_status        text not null check (to_status in ('ready','sent','accepted','done')),
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (request_type_id, step_no)
);

create trigger request_type_scenario_steps_updated before update on public.request_type_scenario_steps
  for each row execute function public.tg_set_updated_at();

create table if not exists public.request_type_scenario_step_fields (
  step_id   uuid not null references public.request_type_scenario_steps(id) on delete cascade,
  field_id  uuid not null references public.request_type_fields(id) on delete cascade,
  primary key (step_id, field_id)
);

alter table public.request_type_scenario_steps enable row level security;
alter table public.request_type_scenario_step_fields enable row level security;

drop policy if exists request_type_scenario_steps_sel on public.request_type_scenario_steps;
drop policy if exists request_type_scenario_steps_adm on public.request_type_scenario_steps;
create policy request_type_scenario_steps_sel on public.request_type_scenario_steps
  for select to authenticated using (true);
create policy request_type_scenario_steps_adm on public.request_type_scenario_steps
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists request_type_scenario_step_fields_sel on public.request_type_scenario_step_fields;
drop policy if exists request_type_scenario_step_fields_adm on public.request_type_scenario_step_fields;
create policy request_type_scenario_step_fields_sel on public.request_type_scenario_step_fields
  for select to authenticated using (true);
create policy request_type_scenario_step_fields_adm on public.request_type_scenario_step_fields
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Дефолтный сценарий для видов без шагов: прораб → ready, офис → sent/accepted/done
insert into public.request_type_scenario_steps(request_type_id, step_no, role_code, to_status, sort)
select t.id, s.step_no, s.role_code, s.to_status, s.step_no
from public.request_types t
cross join (values
  (1, 'foreman', 'ready'),
  (2, 'office',  'sent'),
  (3, 'office',  'accepted'),
  (4, 'office',  'done')
) as s(step_no, role_code, to_status)
where t.deleted_at is null
  and not exists (
    select 1 from public.request_type_scenario_steps x
    where x.request_type_id = t.id and x.deleted_at is null
  );

create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; v_order text[] := array['new','ready','sent','accepted','done'];
        v_from int; v_to int; v_missing int;
        v_names jsonb := '{"new":"Новая","ready":"Готова к отправке","sent":"Отправлена","accepted":"Принята заказчиком","done":"Исполнена"}';
        v_name text;
        v_step record;
        v_my_role text;
        v_is_admin boolean;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  v_from := array_position(v_order, r.status);
  v_to   := array_position(v_order, p_status);
  if v_to is null then raise exception 'Неизвестный статус %', p_status; end if;
  if v_to = v_from then return; end if;
  if v_to > v_from + 1 then raise exception 'Статусы проходятся по порядку'; end if;
  if v_to < v_from and coalesce(trim(p_comment), '') = '' then raise exception 'Укажите причину возврата'; end if;

  v_is_admin := public.is_admin();
  select role_code into v_my_role from public.profiles where id = public.current_profile_id();

  -- Вперёд по сценарию: проверяем роль шага (админ/руководитель — всегда)
  if v_to = v_from + 1 then
    select s.* into v_step
    from public.request_type_scenario_steps s
    where s.request_type_id = r.request_type_id
      and s.to_status = p_status
      and s.deleted_at is null
    order by s.step_no
    limit 1;

    if found and not v_is_admin and v_step.role_code is distinct from v_my_role then
      raise exception 'Этот шаг выполняет роль «%»', v_step.role_code;
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
    elsif p_status = 'ready' then
      -- Fallback как раньше: все required-поля вида
      select count(*) into v_missing from public.request_type_fields f
      where f.request_type_id = r.request_type_id and f.is_active and f.deleted_at is null and f.is_required
        and not exists (select 1 from public.request_field_values fv
                        where fv.request_id = r.id and fv.field_id = f.id
                          and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb)
        and not (f.field_type = 'file' and exists (select 1 from public.files fl
                 where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null));
      if v_missing > 0 then raise exception 'Заполните обязательные поля: %', v_missing; end if;
    end if;
  end if;

  perform set_config('lider.rpc', 'on', true);
  update public.requests set
    status      = p_status,
    office_id   = case when p_status = 'ready' and office_id is null then public.current_profile_id() else office_id end,
    sent_at     = case when p_status = 'sent' then now() when v_to < 3 then null else sent_at end,
    accepted_at = case when p_status = 'accepted' then now() when v_to < 4 then null else accepted_at end,
    done_at     = case when p_status = 'done' then now() else null end,
    done_by     = case when p_status = 'done' then public.current_profile_id() else null end,
    result_text = case when p_status = 'done' and p_comment is not null then p_comment else result_text end
  where id = r.id;

  if p_comment is not null and p_comment <> '' then
    insert into public.request_comments(request_id, author_id, text)
    values (r.id, public.current_profile_id(), p_comment);
  end if;

  select coalesce((select s.name from public.request_statuses s where s.code = p_status), v_names->>p_status) into v_name;
  perform public.log_history(r.object_id, 'request', r.id, 'status_changed',
    format('Заявка №%s «%s»: %s', r.number, r.type_name, v_name),
    jsonb_build_object('from', r.status, 'to', p_status));
end $$;

grant execute on function public.request_set_status(uuid, text, text) to authenticated;
