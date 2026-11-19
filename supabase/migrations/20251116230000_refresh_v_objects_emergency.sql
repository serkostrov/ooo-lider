-- PostgreSQL фиксирует o.*/s.* в view на момент CREATE.
-- После колонок emergency / is_adhoc — пересоздаём представления.

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
