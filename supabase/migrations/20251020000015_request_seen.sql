-- «Новая» = статус new и ещё не открывали карточку.
-- Счётчик в меню считает только такие заявки; открытие снимает метку.

alter table public.requests
  add column if not exists seen_at timestamptz;

-- CREATE OR REPLACE нельзя: новая колонка в r.* сдвигает позиции — нужен DROP.
drop view if exists public.v_objects;
drop view if exists public.v_requests;

create view public.v_requests with (security_invoker = true) as
select r.*,
  o.name as object_name,
  rp.name as representative_name,
  i.full_name as initiator_name,
  om.full_name as office_name,
  (r.status = 'new' and r.seen_at is null) as is_new,
  (r.status <> 'done' and r.call_date < public.msk_today()) as is_overdue
from public.requests r
join public.objects o on o.id = r.object_id
left join public.representatives rp on rp.id = r.representative_id
left join public.profiles i  on i.id = r.initiator_id
left join public.profiles om on om.id = r.office_id
where r.deleted_at is null;

grant select on public.v_requests to authenticated, anon;

create view public.v_objects as
select o.*,
  c.name as customer_name,
  rp.full_name as responsible_name,
  cur.full_name as curator_name,
  tn.full_name as technadzor_name,
  te.full_name as technadzor_ehz_name,
  case when o.contract_end is not null then o.contract_end - public.msk_today() end as contract_days_left,
  agg.stages_total, agg.stages_closed,
  case when agg.stages_total > 0 then round(100.0 * agg.stages_closed / agg.stages_total) else 0 end as progress_pct,
  agg.stages_overdue, agg.stages_no_response, agg.stages_on_review, agg.stages_no_executor,
  cur_st.number as current_stage_number, cur_st.name as current_stage_name,
  coalesce(rq.requests_new, 0) as requests_new, coalesce(rq.requests_overdue, 0) as requests_overdue
from public.objects o
left join public.customers c on c.id = o.customer_id
left join public.profiles rp on rp.id = o.responsible_id
left join public.customer_contacts cur on cur.id = o.curator_contact_id
left join public.customer_contacts tn on tn.id = o.technadzor_contact_id
left join public.customer_contacts te on te.id = o.technadzor_ehz_contact_id
left join lateral (
  select count(*) filter (where true)                         as stages_total,
         count(*) filter (where v.is_closed)                  as stages_closed,
         count(*) filter (where v.is_overdue)                 as stages_overdue,
         count(*) filter (where v.is_no_response)             as stages_no_response,
         count(*) filter (where v.status_code = 'on_review')  as stages_on_review,
         count(*) filter (where v.is_no_executor)             as stages_no_executor
  from public.v_object_stages v where v.object_id = o.id and not v.is_excluded) agg on true
left join lateral (
  select v.number, v.name from public.v_object_stages v
  where v.object_id = o.id and not v.is_excluded and not v.is_closed
  order by v.sort, v.number limit 1) cur_st on true
left join lateral (
  select count(*) filter (where vr.is_new) as requests_new,
         count(*) filter (where vr.is_overdue) as requests_overdue
  from public.v_requests vr where vr.object_id = o.id) rq on true
where o.deleted_at is null and public.can_see_object(o.id);

grant select on public.v_objects to authenticated, anon;

create or replace function public.request_mark_seen(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  if r.status <> 'new' or r.seen_at is not null then return; end if;

  perform set_config('lider.rpc', 'on', true);
  update public.requests set seen_at = now() where id = r.id;
end $$;

grant execute on function public.request_mark_seen(uuid) to authenticated;

-- При возврате на «Новая» снова показать в счётчике, пока не откроют.
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
