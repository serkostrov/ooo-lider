-- Блок 9 v1: персональные уведомления (in-app).
-- View собирает события из этапов/заявок; прочтение — в notification_reads.

-- ---------------------------------------------------------------------
-- 1. Прочитанные события (по профилю)
-- ---------------------------------------------------------------------
create table if not exists public.notification_reads (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_key  text not null,
  read_at    timestamptz not null default now(),
  primary key (profile_id, event_key)
);

create index if not exists notification_reads_profile_read_idx
  on public.notification_reads (profile_id, read_at desc);

alter table public.notification_reads enable row level security;

drop policy if exists notification_reads_own on public.notification_reads;
create policy notification_reads_own on public.notification_reads
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

grant select, insert, update, delete on public.notification_reads to authenticated;

-- Массовое прочтение
create or replace function public.notification_mark_read(p_event_keys text[])
returns int language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_profile_id();
        v_k text;
        v_n int := 0;
begin
  if v_me is null then raise exception 'Нет профиля'; end if;
  if p_event_keys is null then return 0; end if;
  foreach v_k in array p_event_keys loop
    if coalesce(trim(v_k), '') = '' then continue; end if;
    insert into public.notification_reads(profile_id, event_key)
    values (v_me, v_k)
    on conflict (profile_id, event_key) do update set read_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

grant execute on function public.notification_mark_read(text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Лента событий
-- ---------------------------------------------------------------------
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

-- Скоро срок (напоминание), ещё не просрочен
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

-- Нет ответа по документу
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

-- Нет исполнителя
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

-- На проверке
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

-- Просроченная заявка
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
  end is not null;

grant select on public.v_notification_events to authenticated, anon;

comment on view public.v_notification_events is
  'События для колокольчика: просрочка, due_soon, нет ответа, нет исполнителя, на проверке; recipient_profile_id — адресат';
