-- Статус заявки «Требует доработки» (rework):
-- офис: ready|sent|accepted → rework (с комментарием);
-- прораб: rework → ready; в new офис не возвращает.

-- ---------------------------------------------------------------------
-- 1. Справочник + check на requests.status
-- ---------------------------------------------------------------------
alter table public.request_statuses drop constraint if exists request_statuses_code_check;
alter table public.request_statuses
  add constraint request_statuses_code_check
  check (code in ('new','ready','sent','accepted','done','rework'));

alter table public.requests drop constraint if exists requests_status_check;
alter table public.requests
  add constraint requests_status_check
  check (status in ('new','ready','sent','accepted','done','rework'));

insert into public.request_statuses(code, name, action_label, color, sort) values
  ('rework', 'Требует доработки', 'На доработку', '#C45C26', 15)
on conflict (code) do update set
  name = excluded.name,
  action_label = excluded.action_label,
  color = excluded.color,
  sort = excluded.sort;

create or replace function public.tg_request_statuses_fixed_sort()
returns trigger language plpgsql as $$
begin
  new.sort := case new.code
    when 'new' then 1
    when 'ready' then 2
    when 'sent' then 3
    when 'accepted' then 4
    when 'done' then 5
    when 'rework' then 15
    else new.sort
  end;
  return new;
end $$;

update public.request_statuses set sort = case code
  when 'new' then 1
  when 'ready' then 2
  when 'sent' then 3
  when 'accepted' then 4
  when 'done' then 5
  when 'rework' then 15
  else sort
end
where code in ('new', 'ready', 'sent', 'accepted', 'done', 'rework');

-- ---------------------------------------------------------------------
-- 2. Переходы статусов с боковой веткой rework
-- ---------------------------------------------------------------------
create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
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

  v_from := array_position(v_order, r.status); -- null для rework
  v_to   := array_position(v_order, p_status); -- null для rework

  v_to_rework := (p_status = 'rework');
  v_from_rework := (r.status = 'rework');
  v_linear_forward := (v_from is not null and v_to is not null and v_to = v_from + 1);
  v_linear_back := (v_from is not null and v_to is not null and v_to < v_from);

  -- Спец-ветка: на доработку
  if v_to_rework then
    if r.status not in ('ready','sent','accepted') then
      raise exception 'На доработку можно вернуть только из «Готова», «Отправлена» или «Принята»';
    end if;
    if coalesce(trim(p_comment), '') = '' then
      raise exception 'Укажите причину доработки';
    end if;
  elsif v_from_rework then
    -- Из доработки только снова в «Готова к отправке»
    if p_status <> 'ready' then
      raise exception 'Из «Требует доработки» заявка возвращается только в «Готова к отправке»';
    end if;
  elsif v_linear_forward then
    null; -- обычный шаг вперёд
  elsif v_linear_back then
    -- Офис не возвращает в «Новая» — только на доработку
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
  select role_code into v_my_role from public.profiles where id = public.current_profile_id();

  -- Роли для спец-переходов
  if v_to_rework then
    if not v_is_admin and v_my_role is distinct from 'office' then
      raise exception 'На доработку отправляет офис-менеджер';
    end if;
  elsif v_from_rework and p_status = 'ready' then
    -- как new→ready: сценарий или прораб/ПТО
    select s.* into v_step
    from public.request_type_scenario_steps s
    where s.request_type_id = r.request_type_id
      and s.to_status = 'ready'
      and s.deleted_at is null
    order by s.step_no
    limit 1;
    if found and not v_is_admin and v_step.role_code is distinct from v_my_role then
      raise exception 'Этот шаг выполняет роль «%»', v_step.role_code;
    end if;
    if not found and not v_is_admin and v_my_role not in ('foreman','pto') then
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
    end if;
  elsif v_linear_back then
    if not v_is_admin and v_my_role not in ('office','foreman','pto') then
      raise exception 'Нет прав на возврат статуса';
    end if;
  end if;

  -- Обязательные поля прораба при переходе в ready (в т.ч. из rework)
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

    -- сценарийные поля шага ready при rework→ready
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
    -- rework и откат ниже ready сбрасывают sent/accepted
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
    -- new и rework снова «непросмотренные» для счётчика прораба
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
end $$;

grant execute on function public.request_set_status(uuid, text, text) to authenticated;

-- «Новая» в счётчике: new или rework без просмотра
create or replace view public.v_requests with (security_invoker = true) as
select r.*,
  o.name as object_name,
  rp.name as representative_name,
  i.full_name as initiator_name,
  om.full_name as office_name,
  (r.status in ('new','rework') and r.seen_at is null) as is_new,
  (r.status <> 'done' and r.call_date < public.msk_today()) as is_overdue
from public.requests r
join public.objects o on o.id = r.object_id
left join public.representatives rp on rp.id = r.representative_id
left join public.profiles i  on i.id = r.initiator_id
left join public.profiles om on om.id = r.office_id
where r.deleted_at is null;

grant select on public.v_requests to authenticated, anon;

create or replace function public.request_mark_seen(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  if r.status not in ('new','rework') or r.seen_at is not null then return; end if;

  perform set_config('lider.rpc', 'on', true);
  update public.requests set seen_at = now() where id = r.id;
end $$;

grant execute on function public.request_mark_seen(uuid) to authenticated;
