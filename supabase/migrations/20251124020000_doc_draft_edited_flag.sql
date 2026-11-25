-- Помечать заявки, у которых бланк правили в конструкторе (не из формы полей).
-- v_requests создан до колонки doc_draft — drop+create (v_objects зависит от v_requests).

drop view if exists public.v_objects;
drop view if exists public.v_requests;

create view public.v_requests with (security_invoker = true) as
select r.*,
  o.name as object_name,
  rp.name as representative_name,
  i.full_name as initiator_name,
  om.full_name as office_name,
  (r.status in ('new','rework') and r.seen_at is null) as is_new,
  (r.status <> 'done' and r.call_date < public.msk_today()) as is_overdue,
  (r.doc_draft is not null) as doc_draft_edited
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

comment on column public.requests.doc_draft is
  'Черновик исходящего бланка после правок в конструкторе. NULL = бланк из полей заявки.';

-- Явно разрешаем сброс черновика (p_draft = null → метка снимается).
create or replace function public.request_save_doc_draft(p_request_id uuid, p_draft jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  if not (public.is_admin() or public.has_role('office')) then
    raise exception 'Черновик бланка сохраняет офис-менеджер';
  end if;
  if r.status = 'done' then
    raise exception 'После «Исполнена» бланк уже не правят';
  end if;

  update public.requests
  set doc_draft = p_draft, updated_at = now()
  where id = r.id;
end $$;

grant execute on function public.request_save_doc_draft(uuid, jsonb) to authenticated;
