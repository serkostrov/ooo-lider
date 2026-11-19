-- Заявки на сброс пароля: в Telegram уходили админам (раньше recipient был null → очередь их отбрасывала).

create or replace function public.notification_pending_external(p_limit int default 80)
returns table (
  event_key text,
  kind text,
  title text,
  object_id uuid,
  object_name text,
  entity_type text,
  entity_id uuid,
  days int,
  profile_id uuid,
  full_name text,
  email text,
  telegram_chat_id text,
  want_telegram boolean,
  want_email boolean,
  channel text
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  return query
  with base as (
    -- обычные события с явным получателем
    select
      e.event_key,
      e.kind,
      e.title,
      e.object_id,
      e.object_name,
      e.entity_type,
      e.entity_id,
      e.days,
      e.recipient_profile_id as profile_id
    from public.v_notification_events e
    where e.recipient_profile_id is not null

    union all

    -- сброс пароля: рассылаем всем активным админам
    select
      e.event_key,
      e.kind,
      e.title,
      e.object_id,
      e.object_name,
      e.entity_type,
      e.entity_id,
      e.days,
      a.id as profile_id
    from public.v_notification_events e
    join public.profiles a
      on a.deleted_at is null
     and a.is_active
    join public.roles r
      on r.code = a.role_code
     and r.is_admin
    where e.kind = 'password_reset'
      and e.recipient_profile_id is null
  ),
  targets as (
    select
      b.*,
      p.full_name,
      p.email,
      p.telegram_chat_id,
      (p.notify_telegram and p.telegram_chat_id is not null) as want_telegram,
      (p.notify_email and coalesce(trim(p.email), '') <> '') as want_email
    from base b
    join public.profiles p on p.id = b.profile_id and p.deleted_at is null and p.is_active
  ),
  channels as (
    select t.*, 'telegram'::text as channel
    from targets t
    where t.want_telegram
    union all
    select t.*, 'email'::text as channel
    from targets t
    where t.want_email
  )
  select
    c.event_key,
    c.kind,
    c.title,
    c.object_id,
    c.object_name,
    c.entity_type,
    c.entity_id,
    c.days,
    c.profile_id,
    c.full_name,
    c.email,
    c.telegram_chat_id,
    c.want_telegram,
    c.want_email,
    c.channel
  from channels c
  where not exists (
    select 1 from public.notification_deliveries d
    where d.event_key = c.event_key
      and d.profile_id = c.profile_id
      and d.channel = c.channel
      and d.error is null
  )
  order by abs(c.days) desc, c.event_key
  limit greatest(1, least(coalesce(p_limit, 80), 200));
end $$;
