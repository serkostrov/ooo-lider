-- Прораб и ПТО взаимозаменяемы на шагах сценария инициатора
-- (в справочнике у «Заказ снабжение» ready = foreman, иначе ПТО не видит кнопку).

create or replace function public.role_matches_scenario(p_my_role text, p_step_role text)
returns boolean
language sql
immutable
as $$
  select case
    when p_step_role is null then false
    when p_my_role is not distinct from p_step_role then true
    when p_step_role in ('foreman', 'pto') and p_my_role in ('foreman', 'pto') then true
    else false
  end;
$$;

grant execute on function public.role_matches_scenario(text, text) to authenticated;

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
  select role_code into v_my_role from public.profiles where id = public.current_profile_id();

  if v_to_rework then
    if not v_is_admin and v_my_role is distinct from 'office' then
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

    if found and not v_is_admin and not public.role_matches_scenario(v_my_role, v_step.role_code) then
      raise exception 'Этот шаг выполняет роль «%»', v_step.role_code;
    end if;

    -- Нет шага сценария: ready → прораб/ПТО, дальше → офис
    if not found and not v_is_admin then
      if p_status = 'ready' and v_my_role not in ('foreman','pto') then
        raise exception 'В «Готова к отправке» переводит прораб или ПТО';
      end if;
      if p_status <> 'ready' and v_my_role is distinct from 'office' then
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
    if not v_is_admin and v_my_role is distinct from 'office' then
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
end $$;

grant execute on function public.request_set_status(uuid, text, text) to authenticated;
