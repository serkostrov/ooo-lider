-- Уведомление тегнутому в сообщении этапа (@mention).

create or replace view public.v_notification_events
with (security_invoker = true)
as
-- Просроченный этап
select
  ('overdue_stage:' || s.id::text) as event_key,
  'overdue_stage'::text as kind,
  s.object_id,
  o.name as object_name,
  'stage'::text as entity_type,
  s.id as entity_id,
  format('Этап %s «%s» — срок прошёл', coalesce(s.code, s.number::text), s.name) as title,
  st.name as status,
  st.color as status_color,
  s.due_date,
  (public.msk_today() - s.due_date)::int as days,
  coalesce(s.executor_id, o.responsible_id) as recipient_profile_id
from public.object_stages s
join public.objects o on o.id = s.object_id and o.deleted_at is null and o.status <> 'completed'
join public.stage_statuses st on st.code = s.status_code
where s.deleted_at is null
  and not s.is_excluded
  and not st.is_closed
  and s.due_date is not null
  and s.due_date < public.msk_today()

union all

select
  ('due_soon:' || s.id::text),
  'due_soon',
  s.object_id,
  o.name,
  'stage',
  s.id,
  format('Этап %s «%s» — приближается срок', coalesce(s.code, s.number::text), s.name),
  st.name,
  st.color,
  s.due_date,
  (s.due_date - public.msk_today())::int,
  coalesce(s.executor_id, o.responsible_id)
from public.object_stages s
join public.objects o on o.id = s.object_id and o.deleted_at is null and o.status <> 'completed'
join public.stage_statuses st on st.code = s.status_code
where s.deleted_at is null
  and not s.is_excluded
  and not st.is_closed
  and s.due_date is not null
  and s.due_date >= public.msk_today()
  and s.due_date - coalesce(s.remind_days, 0) <= public.msk_today()

union all

select
  ('no_response:' || s.id::text),
  'no_response',
  s.object_id,
  o.name,
  'stage',
  s.id,
  format('Этап %s «%s» — нет ответа по документу', coalesce(s.code, s.number::text), s.name),
  st.name,
  st.color,
  s.response_due,
  (public.msk_today() - s.response_due)::int,
  coalesce(s.executor_id, o.responsible_id)
from public.object_stages s
join public.objects o on o.id = s.object_id and o.deleted_at is null and o.status <> 'completed'
join public.stage_statuses st on st.code = s.status_code
where s.deleted_at is null
  and not s.is_excluded
  and not st.is_closed
  and s.response_due is not null
  and s.response_received_at is null
  and s.response_due < public.msk_today()

union all

select
  ('no_executor:' || s.id::text),
  'no_executor',
  s.object_id,
  o.name,
  'stage',
  s.id,
  format('Этап %s «%s» — не назначен исполнитель', coalesce(s.code, s.number::text), s.name),
  st.name,
  st.color,
  s.due_date,
  case when s.due_date is not null then (public.msk_today() - s.due_date)::int else 0 end,
  o.responsible_id
from public.object_stages s
join public.objects o on o.id = s.object_id and o.deleted_at is null and o.status <> 'completed'
join public.stage_statuses st on st.code = s.status_code
where s.deleted_at is null
  and not s.is_excluded
  and not st.is_closed
  and s.executor_id is null
  and o.responsible_id is not null

union all

select
  ('on_review:' || s.id::text),
  'on_review',
  s.object_id,
  o.name,
  'stage',
  s.id,
  format('Этап %s «%s» — на проверке', coalesce(s.code, s.number::text), s.name),
  st.name,
  st.color,
  s.due_date,
  case when s.due_date is not null then (public.msk_today() - s.due_date)::int else 0 end,
  coalesce(s.confirmer_id, o.responsible_id)
from public.object_stages s
join public.objects o on o.id = s.object_id and o.deleted_at is null and o.status <> 'completed'
join public.stage_statuses st on st.code = s.status_code
where s.deleted_at is null
  and not s.is_excluded
  and s.status_code = 'on_review'
  and coalesce(s.confirmer_id, o.responsible_id) is not null

union all

select
  ('overdue_request:' || r.id::text),
  'overdue_request',
  r.object_id,
  o.name,
  'request',
  r.id,
  format('Заявка №%s «%s» — не исполнена', r.number, r.type_name),
  coalesce(rs.name, r.status),
  rs.color,
  r.call_date,
  (public.msk_today() - r.call_date)::int,
  case
    when r.status in ('new', 'rework') then r.initiator_id
    else coalesce(r.office_id, r.initiator_id)
  end
from public.requests r
join public.objects o on o.id = r.object_id and o.deleted_at is null and o.status <> 'completed'
left join public.request_statuses rs on rs.code = r.status
where r.deleted_at is null
  and r.status <> 'done'
  and r.call_date < public.msk_today()
  and case
    when r.status in ('new', 'rework') then r.initiator_id
    else coalesce(r.office_id, r.initiator_id)
  end is not null

union all

select
  ('status_ask:' || a.id::text),
  'status_ask',
  a.object_id,
  o.name,
  'stage',
  a.stage_id,
  format(
    'Запрос статуса: этап %s «%s»',
    coalesce(s.code, s.number::text),
    s.name
  ),
  'Запрос',
  null,
  null::date,
  0,
  a.executor_id
from public.stage_status_asks a
join public.objects o on o.id = a.object_id and o.deleted_at is null
join public.object_stages s on s.id = a.stage_id and s.deleted_at is null
where a.seen_at is null

union all

select
  ('stage_message_reply:' || m.id::text),
  'stage_message_reply',
  m.object_id,
  o.name,
  'stage',
  m.stage_id,
  format(
    'Ответ на этапе %s «%s»: %s',
    coalesce(s.code, s.number::text),
    s.name,
    left(m.body, 120)
  ),
  'Сообщение',
  null,
  null::date,
  0,
  p.author_id
from public.stage_messages m
join public.stage_messages p on p.id = m.parent_id and p.deleted_at is null
join public.objects o on o.id = m.object_id and o.deleted_at is null
join public.object_stages s on s.id = m.stage_id and s.deleted_at is null
where m.deleted_at is null
  and m.parent_id is not null
  and m.kind = 'chat'
  and p.author_id is distinct from m.author_id
  and m.created_at > now() - interval '14 days'

union all

select
  ('stage_status_reply:' || m.id::text),
  'stage_status_reply',
  m.object_id,
  o.name,
  'stage',
  m.stage_id,
  format(
    'Статус по этапу %s «%s»: %s',
    coalesce(s.code, s.number::text),
    s.name,
    left(m.body, 120)
  ),
  'Статус',
  null,
  null::date,
  0,
  a.asked_by
from public.stage_messages m
join public.stage_status_asks a on a.id = m.status_ask_id
join public.objects o on o.id = m.object_id and o.deleted_at is null
join public.object_stages s on s.id = m.stage_id and s.deleted_at is null
where m.deleted_at is null
  and m.kind = 'status_reply'
  and a.asked_by is distinct from m.author_id
  and m.created_at > now() - interval '14 days'

union all

-- Тег в сообщении (@mention)
select
  ('stage_message_mention:' || m.id::text),
  'stage_message_mention',
  m.object_id,
  o.name,
  'stage',
  m.stage_id,
  format(
    'Вас упомянули на этапе %s «%s»: %s',
    coalesce(s.code, s.number::text),
    s.name,
    left(m.body, 120)
  ),
  'Упоминание',
  null,
  null::date,
  0,
  m.mention_profile_id
from public.stage_messages m
join public.objects o on o.id = m.object_id and o.deleted_at is null
join public.object_stages s on s.id = m.stage_id and s.deleted_at is null
where m.deleted_at is null
  and m.mention_profile_id is not null
  and m.mention_profile_id is distinct from m.author_id
  and m.kind in ('chat', 'status_ask')
  and m.created_at > now() - interval '14 days';

grant select on public.v_notification_events to authenticated, anon;
