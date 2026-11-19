-- Переписка на этапе: сообщения, ответы, запрос/ответ статуса + события в v_notification_events.

-- ---------------------------------------------------------------------
-- 1. Таблица
-- ---------------------------------------------------------------------
create table if not exists public.stage_messages (
  id                  uuid primary key default gen_random_uuid(),
  stage_id            uuid not null references public.object_stages(id) on delete cascade,
  object_id           uuid not null references public.objects(id) on delete cascade,
  author_id           uuid not null references public.profiles(id),
  body                text not null,
  parent_id           uuid references public.stage_messages(id) on delete set null,
  kind                text not null default 'chat'
                      check (kind in ('chat', 'status_ask', 'status_reply')),
  mention_profile_id  uuid references public.profiles(id),
  status_ask_id       uuid references public.stage_status_asks(id) on delete set null,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists stage_messages_stage_idx
  on public.stage_messages (stage_id, created_at asc)
  where deleted_at is null;

create index if not exists stage_messages_parent_idx
  on public.stage_messages (parent_id)
  where parent_id is not null and deleted_at is null;

create index if not exists stage_messages_ask_idx
  on public.stage_messages (status_ask_id)
  where status_ask_id is not null and deleted_at is null;

alter table public.stage_messages enable row level security;

drop policy if exists stage_messages_select on public.stage_messages;
create policy stage_messages_select on public.stage_messages
  for select to authenticated
  using (deleted_at is null and public.can_see_object(object_id));

grant select on public.stage_messages to authenticated;

-- ---------------------------------------------------------------------
-- 2. Право писать
-- ---------------------------------------------------------------------
create or replace function public.can_post_stage_message(p_stage_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_profile_id();
  s public.object_stages;
begin
  if v_me is null then return false; end if;
  if public.is_admin() then return true; end if;

  select * into s from public.object_stages where id = p_stage_id and deleted_at is null;
  if not found then return false; end if;
  if not public.can_see_object(s.object_id) then return false; end if;

  if s.executor_id = v_me or s.coexecutor_id = v_me or s.confirmer_id = v_me then
    return true;
  end if;

  if exists (
    select 1 from public.objects o
    where o.id = s.object_id and o.deleted_at is null and o.responsible_id = v_me
  ) then
    return true;
  end if;

  return exists (
    select 1 from public.object_members m
    where m.object_id = s.object_id and m.profile_id = v_me
  );
end $$;

grant execute on function public.can_post_stage_message(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Обычное сообщение / ответ
-- ---------------------------------------------------------------------
create or replace function public.stage_message_post(
  p_stage_id uuid,
  p_body text,
  p_parent_id uuid default null,
  p_mention_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_profile_id();
  s public.object_stages;
  v_parent public.stage_messages;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_kind text := 'chat';
  v_ask_id uuid := null;
  v_id uuid;
  v_mention uuid := p_mention_profile_id;
begin
  if v_me is null then raise exception 'Нет профиля'; end if;
  if v_body is null then raise exception 'Введите текст сообщения'; end if;
  if char_length(v_body) > 4000 then raise exception 'Слишком длинное сообщение'; end if;

  select * into s from public.object_stages where id = p_stage_id and deleted_at is null;
  if not found then raise exception 'Этап не найден'; end if;
  if not public.can_post_stage_message(p_stage_id) then
    raise exception 'Нет прав писать сообщения на этапе';
  end if;

  if p_parent_id is not null then
    select * into v_parent
    from public.stage_messages
    where id = p_parent_id and stage_id = p_stage_id and deleted_at is null;
    if not found then raise exception 'Сообщение для ответа не найдено'; end if;
    -- один уровень: ответ на ответ → цепляем к корню
    if v_parent.parent_id is not null then
      p_parent_id := v_parent.parent_id;
      select * into v_parent
      from public.stage_messages
      where id = p_parent_id and deleted_at is null;
    end if;
    if v_parent.kind = 'status_ask' then
      v_kind := 'status_reply';
      v_ask_id := v_parent.status_ask_id;
      v_mention := coalesce(v_mention, v_parent.author_id);
    end if;
  end if;

  insert into public.stage_messages(
    stage_id, object_id, author_id, body, parent_id, kind, mention_profile_id, status_ask_id
  )
  values (
    s.id, s.object_id, v_me, v_body, p_parent_id, v_kind, v_mention, v_ask_id
  )
  returning id into v_id;

  if v_kind = 'status_reply' and v_ask_id is not null then
    update public.stage_status_asks
    set seen_at = coalesce(seen_at, now())
    where id = v_ask_id
      and executor_id = v_me
      and seen_at is null;
  end if;

  perform public.log_history(
    s.object_id, 'stage', s.id,
    case when v_kind = 'status_reply' then 'status_reply' else 'stage_message' end,
    case
      when v_kind = 'status_reply' then format('Статус по этапу: %s', left(v_body, 200))
      when p_parent_id is not null then format('Ответ в переписке этапа: %s', left(v_body, 200))
      else format('Сообщение на этапе: %s', left(v_body, 200))
    end,
    jsonb_build_object(
      'message_id', v_id,
      'parent_id', p_parent_id,
      'kind', v_kind,
      'status_ask_id', v_ask_id
    )
  );

  return v_id;
end $$;

grant execute on function public.stage_message_post(uuid, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Запрос статуса → сообщение с тегом исполнителя
-- ---------------------------------------------------------------------
create or replace function public.request_stage_status(p_stage_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.object_stages;
  v_me uuid := public.current_profile_id();
  v_id uuid;
  v_exec uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_body text;
  v_exec_name text;
begin
  if v_me is null then raise exception 'Нет профиля'; end if;

  select * into s from public.object_stages where id = p_stage_id and deleted_at is null;
  if not found then raise exception 'Этап не найден'; end if;
  if not public.can_see_object(s.object_id) then raise exception 'Нет доступа'; end if;

  v_exec := coalesce(s.executor_id, (
    select responsible_id from public.objects where id = s.object_id
  ));
  if v_exec is null then raise exception 'Нет исполнителя / ответственного — некому слать запрос'; end if;

  select coalesce(nullif(trim(full_name), ''), 'исполнитель') into v_exec_name
  from public.profiles where id = v_exec;

  insert into public.stage_status_asks(stage_id, object_id, executor_id, asked_by, note)
  values (s.id, s.object_id, v_exec, v_me, v_note)
  returning id into v_id;

  v_body := format('@%s Запрос статуса по этапу', v_exec_name);
  if v_note is not null then
    v_body := v_body || E'\n' || v_note;
  end if;

  insert into public.stage_messages(
    stage_id, object_id, author_id, body, kind, mention_profile_id, status_ask_id
  )
  values (s.id, s.object_id, v_me, v_body, 'status_ask', v_exec, v_id);

  perform public.log_history(
    s.object_id, 'stage', s.id, 'status_ask',
    format('Запрошен статус по этапу %s «%s»', coalesce(s.code, s.number::text), s.name),
    jsonb_build_object('ask_id', v_id, 'executor_id', v_exec)
  );
  return v_id;
end $$;

grant execute on function public.request_stage_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Явный ответ статусом на запрос
-- ---------------------------------------------------------------------
create or replace function public.stage_message_status_reply(
  p_ask_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_profile_id();
  a public.stage_status_asks;
  v_parent_id uuid;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_id uuid;
begin
  if v_me is null then raise exception 'Нет профиля'; end if;
  if v_body is null then raise exception 'Опишите статус'; end if;

  select * into a from public.stage_status_asks where id = p_ask_id;
  if not found then raise exception 'Запрос статуса не найден'; end if;
  if a.executor_id <> v_me and not public.is_admin() then
    raise exception 'Ответить на запрос может только исполнитель';
  end if;
  if not public.can_post_stage_message(a.stage_id) then
    raise exception 'Нет прав писать сообщения на этапе';
  end if;

  select id into v_parent_id
  from public.stage_messages
  where status_ask_id = a.id and kind = 'status_ask' and deleted_at is null
  order by created_at asc
  limit 1;

  insert into public.stage_messages(
    stage_id, object_id, author_id, body, parent_id, kind, mention_profile_id, status_ask_id
  )
  values (
    a.stage_id, a.object_id, v_me, v_body, v_parent_id, 'status_reply', a.asked_by, a.id
  )
  returning id into v_id;

  update public.stage_status_asks
  set seen_at = coalesce(seen_at, now())
  where id = a.id and seen_at is null;

  perform public.log_history(
    a.object_id, 'stage', a.stage_id, 'status_reply',
    format('Статус по этапу: %s', left(v_body, 200)),
    jsonb_build_object('message_id', v_id, 'ask_id', a.id)
  );

  return v_id;
end $$;

grant execute on function public.stage_message_status_reply(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Лента уведомлений (+ сообщения / статус)
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

-- Скоро срок
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
  end is not null

union all

-- Запрос статуса (для in-app и внешних каналов)
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

-- Ответ на сообщение (не автору самому себе)
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

-- Ответ на запрос статуса → автору запроса
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
  and m.created_at > now() - interval '14 days';

grant select on public.v_notification_events to authenticated, anon;

comment on view public.v_notification_events is
  'События для колокольчика и внешних каналов: сроки, статусы, сообщения этапа';
