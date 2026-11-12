-- Патч для уже существующей базы (тестовый стенд).
-- НЕ запускай целиком init.sql на живой базе — там create table roles без if not exists.
-- Этот файл безопасно гонять повторно: create or replace / if not exists / drop if exists.

-- ---------------------------------------------------------------------
-- 1. Порядок статусов заявки: new → ready → sent → accepted → done
-- ---------------------------------------------------------------------
create or replace function public.tg_request_statuses_fixed_sort()
returns trigger language plpgsql as $$
begin
  new.sort := case new.code
    when 'new' then 1
    when 'ready' then 2
    when 'sent' then 3
    when 'accepted' then 4
    when 'done' then 5
    else new.sort
  end;
  return new;
end $$;

drop trigger if exists request_statuses_fixed_sort on public.request_statuses;
create trigger request_statuses_fixed_sort
  before insert or update on public.request_statuses
  for each row execute function public.tg_request_statuses_fixed_sort();

update public.request_statuses set sort = case code
  when 'new' then 1
  when 'ready' then 2
  when 'sent' then 3
  when 'accepted' then 4
  when 'done' then 5
end
where code in ('new', 'ready', 'sent', 'accepted', 'done');

revoke update (name, action_label, color, sort) on public.request_statuses from authenticated;
grant select, update (name, action_label, color) on public.request_statuses to authenticated;

-- ---------------------------------------------------------------------
-- 2. Создание заявки без полей прораба (пикеты и т. п.)
-- ---------------------------------------------------------------------
create or replace function public.request_create(
  p_object_id uuid, p_request_type_id uuid, p_call_date date,
  p_values jsonb default '[]'::jsonb, p_representative_id uuid default null,
  p_stage_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; t public.request_types; v_number bigint;
begin
  if not public.can_see_object(p_object_id) then raise exception 'Нет прав'; end if;
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
end $$;

grant execute on function public.request_create(uuid, uuid, date, jsonb, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Переходы статусов: поля прораба до ready, поля офиса до sent
-- ---------------------------------------------------------------------
create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
        v_order text[] := array['new','ready','sent','accepted','done'];
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
  if v_from is null then raise exception 'Текущий статус % отсутствует в справочнике', r.status; end if;
  if v_to = v_from then return; end if;
  if v_to > v_from + 1 then raise exception 'Статусы проходятся по порядку'; end if;
  if v_to < v_from and coalesce(trim(p_comment), '') = '' then raise exception 'Укажите причину возврата'; end if;

  v_is_admin := public.is_admin();
  select role_code into v_my_role from public.profiles where id = public.current_profile_id();

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
    end if;

    if p_status in ('ready', 'sent') then
      select count(*) into v_missing
      from public.request_type_fields f
      where f.request_type_id = r.request_type_id
        and f.is_active and f.deleted_at is null and f.is_required
        and (
          f.filled_by = 'initiator'
          or (p_status = 'sent' and f.filled_by = 'office')
        )
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
  end if;

  perform set_config('lider.rpc', 'on', true);
  update public.requests set
    status      = p_status,
    office_id   = case when p_status = 'ready' and office_id is null then public.current_profile_id() else office_id end,
    sent_at     = case when p_status = 'sent' then now() when v_to < 3 then null else sent_at end,
    accepted_at = case when p_status = 'accepted' then now() when v_to < 4 then null else accepted_at end,
    done_at     = case when p_status = 'done' then now() else null end,
    done_by     = case when p_status = 'done' then public.current_profile_id() else null end,
    result_text = case when p_status = 'done' and p_comment is not null then p_comment else result_text end,
    seen_at     = case when p_status = 'new' then null else coalesce(seen_at, now()) end
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

-- ---------------------------------------------------------------------
-- 4. Личные настройки пользователя (флаг окна «Просрочено» и дальше)
-- ---------------------------------------------------------------------
drop table if exists public.app_settings;

create table if not exists public.user_settings (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, key)
);

drop trigger if exists user_settings_updated on public.user_settings;
create trigger user_settings_updated before update on public.user_settings
  for each row execute function public.tg_set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists user_settings_own on public.user_settings;
create policy user_settings_own on public.user_settings
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

grant select, insert, update, delete on public.user_settings to authenticated;
