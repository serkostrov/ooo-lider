-- Порядок шагов «Хода заявки» настраивается в справочнике (колонка sort).
-- Переходы в request_set_status() идут по sort, не по жёсткому массиву кодов.

grant select, update (name, action_label, color, sort) on public.request_statuses to authenticated;

create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
        v_order text[];
        v_from int; v_to int; v_missing int;
        v_sent_pos int; v_accepted_pos int;
        v_names jsonb := '{"new":"Новая","ready":"Готова к отправке","sent":"Отправлена","accepted":"Принята заказчиком","done":"Исполнена"}';
        v_name text;
        v_step record;
        v_my_role text;
        v_is_admin boolean;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;

  select coalesce(array_agg(code order by sort), array['new','ready','sent','accepted','done'])
    into v_order
  from public.request_statuses;

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
    elsif p_status = 'ready' then
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

  v_sent_pos := array_position(v_order, 'sent');
  v_accepted_pos := array_position(v_order, 'accepted');

  perform set_config('lider.rpc', 'on', true);
  update public.requests set
    status      = p_status,
    office_id   = case when p_status = 'ready' and office_id is null then public.current_profile_id() else office_id end,
    sent_at     = case
      when p_status = 'sent' then now()
      when v_sent_pos is not null and v_to < v_sent_pos then null
      else sent_at
    end,
    accepted_at = case
      when p_status = 'accepted' then now()
      when v_accepted_pos is not null and v_to < v_accepted_pos then null
      else accepted_at
    end,
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
