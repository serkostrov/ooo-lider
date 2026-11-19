-- Ролевые ограничения RPC: создание заявок, дефолтные роли переходов,
-- статусы/условия/шаги этапа — только исполнитель / соисполнитель / адресат / admin.

-- ---------------------------------------------------------------------
-- 1. request_create — только admin / director (is_admin) или прораб / ПТО
-- ---------------------------------------------------------------------
create or replace function public.request_create(
  p_object_id uuid, p_request_type_id uuid, p_call_date date,
  p_values jsonb default '[]'::jsonb, p_representative_id uuid default null,
  p_stage_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; t public.request_types; v_number bigint;
        v_my_role text; v_is_admin boolean;
begin
  if not public.can_see_object(p_object_id) then raise exception 'Нет прав'; end if;

  v_is_admin := public.is_admin();
  select role_code into v_my_role from public.profiles where id = public.current_profile_id();
  if not v_is_admin and v_my_role not in ('foreman', 'pto') then
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
end $$;

grant execute on function public.request_create(uuid, uuid, date, jsonb, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. request_set_status — дефолтные роли при отсутствии шага сценария
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
    if not v_is_admin and v_my_role not in ('office','foreman','pto') then
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

-- ---------------------------------------------------------------------
-- 3. stage_set_status — исполнитель/соисполнитель; закрытие/возврат — адресат
-- ---------------------------------------------------------------------
create or replace function public.stage_set_status(p_stage_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.object_stages; v_open_required int; v_name text; v_old text; v_label text;
        v_me uuid; v_is_admin boolean; v_is_worker boolean; v_is_confirmer boolean;
begin
  select * into s from public.object_stages where id = p_stage_id and deleted_at is null for update;
  if not found then raise exception 'Этап не найден'; end if;
  if not public.can_see_object(s.object_id) then raise exception 'Нет прав'; end if;
  if s.is_excluded then raise exception 'Этап исключён'; end if;
  if not exists (select 1 from public.stage_statuses where code = p_status) then
    raise exception 'Неизвестный статус %', p_status; end if;

  v_me := public.current_profile_id();
  v_is_admin := public.is_admin();
  v_is_worker := v_is_admin
    or coalesce(s.executor_id = v_me, false)
    or coalesce(s.coexecutor_id = v_me, false);
  v_is_confirmer := v_is_admin or coalesce(s.confirmer_id = v_me, false);

  -- Закрытие и возврат с проверки — адресат / admin
  if p_status = 'closed'
     or (s.status_code = 'on_review' and p_status in ('in_work','not_started')) then
    if not v_is_confirmer then
      raise exception 'Закрыть или вернуть с проверки может только адресат или администратор';
    end if;
  elsif not v_is_worker then
    raise exception 'Статус этапа меняет исполнитель, соисполнитель или администратор';
  end if;

  if p_status in ('on_review','closed') then
    select count(*) into v_open_required from public.object_stage_conditions
    where stage_id = s.id and deleted_at is null and is_required and not is_done;
    if v_open_required > 0 then
      raise exception 'Не отмечены условия закрытия: %', v_open_required; end if;
  end if;

  if s.status_code = 'on_review' and p_status in ('in_work','not_started') and coalesce(trim(p_comment),'') = '' then
    raise exception 'Укажите причину возврата'; end if;

  perform set_config('lider.rpc', 'on', true);
  v_old := s.status_code;
  v_label := coalesce(s.code, s.number::text);

  -- Самоназначение при «взять в работу», если исполнитель пуст (admin или уже прошёл проверку worker выше только если назначен — admin)
  if p_status = 'in_work' and v_old = 'not_started' and s.executor_id is null and v_is_admin then
    update public.object_stages set executor_id = v_me where id = s.id;
    s.executor_id := v_me;
  end if;

  update public.object_stages set
    status_code = p_status,
    start_date  = case when p_status <> 'not_started' and start_date is null then public.msk_today() else start_date end,
    due_date    = case when p_status <> 'not_started' and due_date is null and duration_days is not null
                       then coalesce(start_date, public.msk_today()) + duration_days else due_date end,
    doc_sent_at = case when p_status in ('sent','on_approval') and doc_sent_at is null then public.msk_today() else doc_sent_at end,
    closed_at   = case when p_status = 'closed' then now() else null end,
    closed_by   = case when p_status = 'closed' then v_me else null end,
    return_reason = case when v_old = 'on_review' and p_status in ('in_work','not_started') then p_comment else return_reason end,
    out_of_order = out_of_order or (v_old = 'not_started' and p_status <> 'not_started' and exists (
      select 1 from public.object_stage_predecessors pr join public.object_stages ps on ps.id = pr.predecessor_id
      where pr.stage_id = s.id and ps.status_code <> 'closed' and not ps.is_excluded and ps.deleted_at is null))
  where id = s.id;

  select name into v_name from public.stage_statuses where code = p_status;
  perform public.log_history(s.object_id, 'stage', s.id, 'status_changed',
    format('Этап %s «%s»: %s%s', v_label, s.name, v_name,
           case when p_comment is not null and p_comment <> '' then ' — ' || p_comment else '' end),
    jsonb_build_object('from', v_old, 'to', p_status));
end $$;

grant execute on function public.stage_set_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. stage_condition_set — исполнитель / соисполнитель / admin
-- ---------------------------------------------------------------------
create or replace function public.stage_condition_set(p_condition_id uuid, p_done boolean, p_value text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
        v_me uuid; v_is_admin boolean;
begin
  select oc.*, s.object_id, s.executor_id, s.coexecutor_id, s.is_excluded,
         st.is_closed,
         coalesce(s.code, s.number::text) as stage_label, s.name as stage_name into c
  from public.object_stage_conditions oc
  join public.object_stages s on s.id = oc.stage_id
  join public.stage_statuses st on st.code = s.status_code
  where oc.id = p_condition_id;
  if not found then raise exception 'Условие не найдено'; end if;
  if not public.can_see_object(c.object_id) then raise exception 'Нет прав'; end if;
  if c.is_excluded or c.is_closed then raise exception 'Этап закрыт или исключён'; end if;

  v_me := public.current_profile_id();
  v_is_admin := public.is_admin();
  if not v_is_admin
     and c.executor_id is distinct from v_me
     and c.coexecutor_id is distinct from v_me then
    raise exception 'Условия отмечает исполнитель или соисполнитель';
  end if;

  if p_done and c.kind = 'file' and not exists (
      select 1 from public.files f where f.entity_type = 'stage_condition' and f.entity_id = c.id and f.deleted_at is null) then
    raise exception 'Сначала прикрепите файл'; end if;
  if p_done and c.kind = 'field' and coalesce(trim(p_value), '') = '' then
    raise exception 'Заполните значение'; end if;

  update public.object_stage_conditions set
    is_done = p_done, value_text = coalesce(p_value, value_text),
    done_by = case when p_done then v_me end,
    done_at = case when p_done then now() end
  where id = p_condition_id;

  perform public.log_history(c.object_id, 'stage', c.stage_id, 'condition_set',
    format('Этап %s: условие «%s» — %s', c.stage_label, c.title, case when p_done then 'выполнено' else 'снята отметка' end));
end $$;

grant execute on function public.stage_condition_set(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. stage_step_complete — роль шага или admin
-- ---------------------------------------------------------------------
create or replace function public.stage_step_complete(p_step_id uuid, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
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
  select role_code into v_my_role from public.profiles where id = v_me;
  if not v_is_admin and v_my_role is distinct from st.role_code then
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
end $$;

grant execute on function public.stage_step_complete(uuid, text) to authenticated;
