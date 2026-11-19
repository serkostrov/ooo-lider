-- Блок 7: очистка return_reason при повторной отправке на проверку.
-- Блок 8: флаг requires_id_folder_complete + блокировка on_review/closed при неполной папке ИД.

-- ---------------------------------------------------------------------
-- 1. Флаг «нужна полная папка ИД» (герметичность / опрессовка и т.п.)
-- ---------------------------------------------------------------------
alter table public.stage_templates
  add column if not exists requires_id_folder_complete boolean not null default false;

alter table public.object_stages
  add column if not exists requires_id_folder_complete boolean not null default false;

update public.stage_templates
set requires_id_folder_complete = true
where deleted_at is null
  and name ~* 'герметичн|опрессов';

update public.object_stages os
set requires_id_folder_complete = true
where os.deleted_at is null
  and (
    os.name ~* 'герметичн|опрессов'
    or exists (
      select 1 from public.stage_templates t
      where t.id = os.template_id and t.requires_id_folder_complete
    )
  );

-- ---------------------------------------------------------------------
-- 2. add_object_stages — копировать флаг с шаблона
-- ---------------------------------------------------------------------
create or replace function public.add_object_stages(p_object_id uuid, p_template_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_tid uuid;
  t record;
  v_stage uuid;
  v_count int := 0;
  v_first int;
  v_next int;
  v_new_ids uuid[] := '{}';
  v_pred uuid;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select coalesce(max(number), 0) into v_next
  from public.object_stages
  where object_id = p_object_id and deleted_at is null and parent_id is null;

  foreach v_tid in array coalesce(p_template_ids, '{}')
  loop
    select * into t from public.stage_templates
    where id = v_tid and deleted_at is null;
    if not found then continue; end if;

    v_next := v_next + 1;
    insert into public.object_stages(
      object_id, template_id, number, code, name, work_type_id, description,
      duration_days, confirmer_role, outgoing_doc, expected_doc, response_days, remind_days,
      is_critical, requires_id_folder_complete, sort, parent_id
    )
    values (
      p_object_id, t.id, v_next, v_next::text, t.name, t.work_type_id, t.description, t.duration_days,
      t.confirmer_role, t.outgoing_doc, t.expected_doc, t.response_days, t.remind_days,
      t.is_critical, coalesce(t.requires_id_folder_complete, false), v_next, null
    )
    returning id into v_stage;

    v_new_ids := array_append(v_new_ids, v_stage);

    insert into public.object_stage_conditions(stage_id, title, kind, is_required, to_id_folder, document_id, sort)
    select v_stage, c.title, c.kind, c.is_required, c.to_id_folder, c.document_id, c.sort
    from public.stage_template_conditions c where c.template_id = t.id and c.deleted_at is null;

    select min(step_no) into v_first from public.stage_template_steps
    where template_id = t.id and deleted_at is null;
    insert into public.object_stage_steps(stage_id, step_no, role_code, action, action_kind, duration_days, state)
    select v_stage, st.step_no, st.role_code, st.action, st.action_kind, st.duration_days,
           case when st.step_no = v_first then 'current' else 'pending' end
    from public.stage_template_steps st where st.template_id = t.id and st.deleted_at is null;

    update public.object_stages s set executor_id = (
      select m.profile_id from public.object_members m join public.profiles p on p.id = m.profile_id
      where m.object_id = p_object_id and p.role_code = t.executor_role and p.deleted_at is null
      order by m.created_at limit 1)
    where s.id = v_stage and t.executor_role is not null;

    v_count := v_count + 1;
  end loop;

  foreach v_stage in array v_new_ids
  loop
    for t in
      select tp.predecessor_id
      from public.object_stages s
      join public.stage_template_predecessors tp on tp.template_id = s.template_id
      where s.id = v_stage
    loop
      select sp.id into v_pred
      from public.object_stages sp
      where sp.object_id = p_object_id
        and sp.template_id = t.predecessor_id
        and sp.deleted_at is null
        and sp.parent_id is null
        and sp.id <> v_stage
      order by sp.sort desc, sp.created_at desc
      limit 1;
      if v_pred is not null then
        insert into public.object_stage_predecessors(stage_id, predecessor_id)
        values (v_stage, v_pred)
        on conflict do nothing;
      end if;
    end loop;
  end loop;

  perform public.renumber_object_stages(p_object_id);

  if v_count > 0 then
    perform public.log_history(p_object_id, 'object', p_object_id, 'stages_added',
      format('Добавлено этапов: %s', v_count), jsonb_build_object('template_ids', p_template_ids));
  end if;
  return v_count;
end $$;

grant execute on function public.add_object_stages(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 3. stage_set_status — return_reason + проверка папки ИД
-- ---------------------------------------------------------------------
create or replace function public.stage_set_status(p_stage_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.object_stages; v_open_required int; v_missing_id int; v_name text; v_old text; v_label text;
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

    -- Критичные этапы (герметичность / опрессовка): папка ИД по объекту должна быть полной
    if s.requires_id_folder_complete then
      select count(*) into v_missing_id
      from public.object_stage_conditions c
      join public.object_stages st on st.id = c.stage_id
      where st.object_id = s.object_id
        and st.deleted_at is null and not st.is_excluded
        and c.deleted_at is null and c.to_id_folder and not c.is_done;
      if v_missing_id > 0 then
        raise exception 'Папка ИД неполная: не отмечено позиций %', v_missing_id;
      end if;
    end if;
  end if;

  if s.status_code = 'on_review' and p_status in ('in_work','not_started') and coalesce(trim(p_comment),'') = '' then
    raise exception 'Укажите причину возврата'; end if;

  perform set_config('lider.rpc', 'on', true);
  v_old := s.status_code;
  v_label := coalesce(s.code, s.number::text);

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
    return_reason = case
      when v_old = 'on_review' and p_status in ('in_work','not_started') then p_comment
      when p_status in ('on_review','closed') then null
      else return_reason
    end,
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
-- 4. View: поле уже в s.*, пересоздаём для ясности типов
-- ---------------------------------------------------------------------
drop view if exists public.v_objects;
drop view if exists public.v_object_stages;

create view public.v_object_stages with (security_invoker = true) as
select s.*,
  st.name  as status_name, st.color as status_color, st.is_closed,
  wt.name  as work_type_name,
  e.full_name  as executor_name,
  ce.full_name as coexecutor_name,
  cr.name      as confirmer_role_name,
  cf.full_name as confirmer_name,
  p.code       as parent_code,
  p.name       as parent_name,
  (select count(*) from public.object_stage_conditions c where c.stage_id = s.id and c.deleted_at is null) as conditions_total,
  (select count(*) from public.object_stage_conditions c where c.stage_id = s.id and c.deleted_at is null and c.is_done) as conditions_done,
  (not st.is_closed and s.due_date is not null and s.due_date < public.msk_today()) as is_overdue,
  (not st.is_closed and s.due_date is not null and s.due_date >= public.msk_today()
     and s.due_date - coalesce(s.remind_days, 0) <= public.msk_today()) as is_due_soon,
  (not st.is_closed and s.response_due is not null and s.response_received_at is null
     and s.response_due < public.msk_today()) as is_no_response,
  (not st.is_closed and s.executor_id is null) as is_no_executor,
  case when not st.is_closed and s.due_date is not null then s.due_date - public.msk_today() end as days_left,
  (select ss.role_code from public.object_stage_steps ss where ss.stage_id = s.id and ss.state = 'current' limit 1) as current_step_role,
  (select ss.action    from public.object_stage_steps ss where ss.stage_id = s.id and ss.state = 'current' limit 1) as current_step_action
from public.object_stages s
join public.stage_statuses st on st.code = s.status_code
left join public.work_types wt on wt.id = s.work_type_id
left join public.profiles e  on e.id = s.executor_id
left join public.profiles ce on ce.id = s.coexecutor_id
left join public.roles cr    on cr.code = s.confirmer_role
left join public.profiles cf on cf.id = s.confirmer_id
left join public.object_stages p on p.id = s.parent_id and p.deleted_at is null
where s.deleted_at is null;

grant select on public.v_object_stages to authenticated, anon;

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
