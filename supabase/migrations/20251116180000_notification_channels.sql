-- Внешние каналы уведомлений: Telegram + email.
-- Секреты (токен бота, SMTP) — в env / supabase secrets, не в БД.

-- ---------------------------------------------------------------------
-- 1. Поля профиля
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_username text,
  add column if not exists notify_telegram boolean not null default true,
  add column if not exists notify_email boolean not null default true;

create unique index if not exists profiles_telegram_chat_id_uidx
  on public.profiles (telegram_chat_id)
  where telegram_chat_id is not null and deleted_at is null;

comment on column public.profiles.telegram_chat_id is 'chat_id Telegram для уведомлений';
comment on column public.profiles.notify_telegram is 'Слать дубли в Telegram';
comment on column public.profiles.notify_email is 'Слать дубли на email';

-- ---------------------------------------------------------------------
-- 2. Коды привязки бота (кнопка «Привязать»)
-- ---------------------------------------------------------------------
create table if not exists public.telegram_link_codes (
  code        text primary key,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists telegram_link_codes_profile_idx
  on public.telegram_link_codes (profile_id);

alter table public.telegram_link_codes enable row level security;

-- Пользователь не читает чужие коды; создание только через RPC
drop policy if exists telegram_link_codes_deny on public.telegram_link_codes;
create policy telegram_link_codes_deny on public.telegram_link_codes
  for all to authenticated using (false) with check (false);

-- ---------------------------------------------------------------------
-- 3. Журнал внешних отправок
-- ---------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id          uuid primary key default gen_random_uuid(),
  event_key   text not null,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  channel     text not null check (channel in ('telegram', 'email')),
  sent_at     timestamptz not null default now(),
  error       text,
  unique (event_key, profile_id, channel)
);

create index if not exists notification_deliveries_sent_idx
  on public.notification_deliveries (sent_at desc);

alter table public.notification_deliveries enable row level security;

drop policy if exists notification_deliveries_admin_select on public.notification_deliveries;
create policy notification_deliveries_admin_select on public.notification_deliveries
  for select to authenticated
  using (public.is_admin());

grant select on public.notification_deliveries to authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC: создать код привязки
-- ---------------------------------------------------------------------
create or replace function public.telegram_create_link_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_profile_id();
  v_code text;
begin
  if v_me is null then raise exception 'Нет профиля'; end if;

  delete from public.telegram_link_codes
  where profile_id = v_me or expires_at < now();

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.telegram_link_codes(code, profile_id, expires_at)
  values (v_code, v_me, now() + interval '15 minutes');

  return v_code;
end $$;

grant execute on function public.telegram_create_link_code() to authenticated;

-- Привязка из webhook (только service_role)
create or replace function public.telegram_complete_link(
  p_code text,
  p_chat_id text,
  p_username text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row public.telegram_link_codes;
  v_profile uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_chat_id), '') = '' then
    raise exception 'Нужны code и chat_id';
  end if;

  select * into v_row
  from public.telegram_link_codes
  where code = upper(trim(p_code)) and expires_at > now();
  if not found then
    raise exception 'Код недействителен или истёк';
  end if;

  v_profile := v_row.profile_id;

  update public.profiles
  set telegram_chat_id = null
  where telegram_chat_id = trim(p_chat_id)
    and id <> v_profile
    and deleted_at is null;

  update public.profiles
  set
    telegram_chat_id = trim(p_chat_id),
    telegram_username = nullif(trim(coalesce(p_username, '')), ''),
    updated_at = now()
  where id = v_profile;

  delete from public.telegram_link_codes where profile_id = v_profile;

  return v_profile;
end $$;

revoke all on function public.telegram_complete_link(text, text, text) from public, anon, authenticated;
grant execute on function public.telegram_complete_link(text, text, text) to service_role;

create or replace function public.telegram_unlink()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_profile_id();
begin
  if v_me is null then raise exception 'Нет профиля'; end if;
  update public.profiles
  set telegram_chat_id = null, telegram_username = null, updated_at = now()
  where id = v_me;
end $$;

grant execute on function public.telegram_unlink() to authenticated;

create or replace function public.notification_set_channels(
  p_telegram boolean default null,
  p_email boolean default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_profile_id();
begin
  if v_me is null then raise exception 'Нет профиля'; end if;
  update public.profiles
  set
    notify_telegram = coalesce(p_telegram, notify_telegram),
    notify_email = coalesce(p_email, notify_email),
    updated_at = now()
  where id = v_me;
end $$;

grant execute on function public.notification_set_channels(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Очередь на внешнюю отправку (service_role)
-- ---------------------------------------------------------------------
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

revoke all on function public.notification_pending_external(int) from public, anon, authenticated;
grant execute on function public.notification_pending_external(int) to service_role;

create or replace function public.notification_mark_delivered(
  p_event_key text,
  p_profile_id uuid,
  p_channel text,
  p_error text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  insert into public.notification_deliveries(event_key, profile_id, channel, error)
  values (p_event_key, p_profile_id, p_channel, p_error)
  on conflict (event_key, profile_id, channel) do update
    set sent_at = now(), error = excluded.error;
end $$;

revoke all on function public.notification_mark_delivered(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.notification_mark_delivered(text, uuid, text, text) to service_role;

grant execute on function public.is_admin() to authenticated;
