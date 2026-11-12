-- Единый список просроченных заявок и этапов (для курсорной пагинации и count).
-- Только незавершённые объекты. Видимость — RLS базовых таблиц (security_invoker).

create or replace view public.v_overdue
with (security_invoker = true)
as
select
  'request'::text as kind,
  r.id,
  r.object_id,
  o.name as object_name,
  format('Заявка №%s «%s»', r.number, r.type_name) as title,
  coalesce(rs.name, r.status) as status,
  rs.color as status_color,
  coalesce(om.full_name, i.full_name) as responsible,
  r.call_date as due_date,
  (public.msk_today() - r.call_date)::int as days,
  null::text as note
from public.requests r
join public.objects o
  on o.id = r.object_id
 and o.deleted_at is null
 and o.status <> 'completed'
left join public.request_statuses rs on rs.code = r.status
left join public.profiles i on i.id = r.initiator_id
left join public.profiles om on om.id = r.office_id
where r.deleted_at is null
  and r.status <> 'done'
  and r.call_date < public.msk_today()

union all

select
  'stage'::text as kind,
  s.id,
  s.object_id,
  o.name as object_name,
  format('Этап %s «%s»', s.number, s.name) as title,
  st.name as status,
  st.color as status_color,
  e.full_name as responsible,
  s.due_date,
  (public.msk_today() - s.due_date)::int as days,
  s.note
from public.object_stages s
join public.objects o
  on o.id = s.object_id
 and o.deleted_at is null
 and o.status <> 'completed'
join public.stage_statuses st on st.code = s.status_code
left join public.profiles e on e.id = s.executor_id
where s.deleted_at is null
  and not s.is_excluded
  and not st.is_closed
  and s.due_date is not null
  and s.due_date < public.msk_today();

grant select on public.v_overdue to authenticated, anon;

comment on view public.v_overdue is
  'Просроченные заявки и этапы по незавершённым объектам; сортировка: days desc, id desc';
