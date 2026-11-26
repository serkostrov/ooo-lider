-- Реестр исходящих/входящих: Письма / Технадзор / Геотрест.

create table if not exists public.registry_entries (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('letters', 'technadzor', 'geotrest')),
  number int not null,
  request_id uuid references public.requests(id),
  request_type_id uuid references public.request_types(id),
  object_id uuid references public.objects(id),
  counterparty text,
  out_date date,
  out_content text,
  out_doc_path text,
  in_date date,
  in_letter_no text,
  in_content text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists registry_entries_request_uidx
  on public.registry_entries(request_id)
  where request_id is not null and deleted_at is null;

create unique index if not exists registry_entries_channel_number_uidx
  on public.registry_entries(channel, number)
  where deleted_at is null;

create index if not exists registry_entries_channel_idx
  on public.registry_entries(channel)
  where deleted_at is null;

create trigger registry_entries_updated before update on public.registry_entries
  for each row execute function public.tg_set_updated_at();

comment on table public.registry_entries is
  'Реестр: письма / технадзор / геотрест. Одна строка на цикл заявки или ручную запись.';
comment on column public.registry_entries.in_letter_no is
  'Спецномер Геотрест (2329…) или № входящего письма';

alter table public.registry_entries enable row level security;

create policy registry_entries_select on public.registry_entries
  for select to authenticated
  using (
    deleted_at is null
    and (object_id is null or public.can_see_object(object_id))
  );

create policy registry_entries_insert on public.registry_entries
  for insert to authenticated
  with check (
    public.is_admin() or public.has_role('office')
  );

create policy registry_entries_update on public.registry_entries
  for update to authenticated
  using (public.is_admin() or public.has_role('office'))
  with check (public.is_admin() or public.has_role('office'));

-- channel по типу заявки
create or replace function public.registry_channel_for_request(p_request_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tpl text;
  v_name text;
begin
  select t.doc_template, t.name into v_tpl, v_name
  from public.requests r
  join public.request_types t on t.id = r.request_type_id
  where r.id = p_request_id;
  if not found then return 'letters'; end if;
  if v_tpl = 'geotrest_message' or lower(coalesce(v_name, '')) like '%геотрест%' then
    return 'geotrest';
  end if;
  if v_tpl = 'technadzor_xlsx' or lower(coalesce(v_name, '')) like '%технадзор%' then
    return 'technadzor';
  end if;
  return 'letters';
end $$;

create or replace function public.registry_next_number(p_channel text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(number), 0) + 1
  from public.registry_entries
  where channel = p_channel and deleted_at is null;
$$;

-- Текст исходящего из doc_draft / типа
create or replace function public.registry_out_content_from_request(p_request_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.requests;
  v_draft jsonb;
  v_kind text;
  v_msg text;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null;
  if not found then return null; end if;
  v_draft := r.doc_draft;
  if v_draft is null then
    return format('Заявка №%s «%s»', r.number, r.type_name);
  end if;
  v_kind := coalesce(v_draft->>'template', '');
  if v_kind = 'geotrest_message' then
    v_msg := coalesce(
      nullif(trim(v_draft->'geotrest'->>'messageOverride'), ''),
      nullif(trim(concat_ws(E'\n',
        v_draft->'geotrest'->>'callLine',
        v_draft->'geotrest'->>'objectLine',
        v_draft->'geotrest'->>'volume',
        v_draft->'geotrest'->>'address',
        v_draft->'geotrest'->>'responsible'
      )), '')
    );
    return coalesce(nullif(v_msg, ''), format('Заявка №%s «%s»', r.number, r.type_name));
  end if;
  return format('Заявка №%s «%s»', r.number, r.type_name);
end $$;

create or replace function public.registry_upsert_on_sent(
  p_request_id uuid,
  p_out_content text default null,
  p_out_doc_path text default null,
  p_counterparty text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
  v_channel text;
  v_id uuid;
  v_num int;
  v_customer text;
  v_content text;
begin
  -- Триггер после request_set_status: lider.rpc=on (права уже проверены)
  if coalesce(current_setting('lider.rpc', true), '') is distinct from 'on' then
    if not (public.is_admin() or public.has_role('office')) then
      raise exception 'Нет прав';
    end if;
  end if;

  select * into r from public.requests where id = p_request_id and deleted_at is null;
  if not found then raise exception 'Заявка не найдена'; end if;
  if coalesce(current_setting('lider.rpc', true), '') is distinct from 'on' then
    if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  end if;

  v_channel := public.registry_channel_for_request(p_request_id);

  select c.name into v_customer
  from public.objects o
  left join public.customers c on c.id = o.customer_id
  where o.id = r.object_id;

  v_content := coalesce(
    nullif(trim(p_out_content), ''),
    public.registry_out_content_from_request(p_request_id)
  );

  select id into v_id
  from public.registry_entries
  where request_id = p_request_id and deleted_at is null;

  if v_id is not null then
    update public.registry_entries set
      out_date = coalesce(out_date, public.msk_today()),
      out_content = coalesce(v_content, out_content),
      out_doc_path = coalesce(nullif(trim(p_out_doc_path), ''), out_doc_path),
      counterparty = coalesce(nullif(trim(p_counterparty), ''), nullif(trim(counterparty), ''), v_customer),
      request_type_id = r.request_type_id,
      object_id = r.object_id,
      updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  v_num := public.registry_next_number(v_channel);
  insert into public.registry_entries(
    channel, number, request_id, request_type_id, object_id,
    counterparty, out_date, out_content, out_doc_path, created_by
  ) values (
    v_channel, v_num, r.id, r.request_type_id, r.object_id,
    coalesce(nullif(trim(p_counterparty), ''), v_customer),
    public.msk_today(),
    v_content,
    nullif(trim(p_out_doc_path), ''),
    public.current_profile_id()
  )
  returning id into v_id;

  perform public.log_history(r.object_id, 'request', r.id, 'registry_out',
    format('Реестр %s: исходящее №%s', v_channel, v_num));

  return v_id;
end $$;

-- Принять ответ + статус accepted
create or replace function public.registry_accept_with_response(
  p_request_id uuid,
  p_letter_no text,
  p_content text,
  p_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
  v_channel text;
  v_id uuid;
  v_date date := coalesce(p_date, public.msk_today());
begin
  if not (public.is_admin() or public.has_role('office')) then
    raise exception 'Нет прав';
  end if;

  select * into r from public.requests where id = p_request_id and deleted_at is null;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;

  if r.status not in ('sent', 'accepted') then
    raise exception 'Ответ принимают из статуса «Отправлена»';
  end if;

  v_channel := public.registry_channel_for_request(p_request_id);

  if v_channel = 'geotrest' and coalesce(trim(p_letter_no), '') = '' then
    raise exception 'Укажите спецномер ответа Геотрест';
  end if;
  if coalesce(trim(p_content), '') = '' then
    raise exception 'Укажите текст ответа';
  end if;

  -- строка исходящего, если ещё нет (на всякий случай)
  perform public.registry_upsert_on_sent(p_request_id);

  select id into v_id
  from public.registry_entries
  where request_id = p_request_id and deleted_at is null;

  update public.registry_entries set
    in_date = v_date,
    in_letter_no = nullif(trim(p_letter_no), ''),
    in_content = trim(p_content),
    updated_at = now()
  where id = v_id;

  if r.status = 'sent' then
    perform public.request_set_status(p_request_id, 'accepted', null);
  end if;

  perform public.log_history(r.object_id, 'request', r.id, 'registry_in',
    format('Реестр: входящий ответ%s',
      case when nullif(trim(p_letter_no), '') is not null
        then format(' №%s', trim(p_letter_no)) else '' end));
end $$;

-- Ручная запись / правка
create or replace function public.registry_save_entry(
  p_id uuid,
  p_channel text,
  p_counterparty text,
  p_out_date date,
  p_out_content text,
  p_in_date date,
  p_in_letter_no text,
  p_in_content text,
  p_object_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_num int;
begin
  if not (public.is_admin() or public.has_role('office')) then
    raise exception 'Нет прав';
  end if;
  if p_channel not in ('letters', 'technadzor', 'geotrest') then
    raise exception 'Неизвестный раздел реестра';
  end if;

  if p_id is not null then
    update public.registry_entries set
      counterparty = nullif(trim(p_counterparty), ''),
      out_date = p_out_date,
      out_content = nullif(trim(p_out_content), ''),
      in_date = p_in_date,
      in_letter_no = nullif(trim(p_in_letter_no), ''),
      in_content = nullif(trim(p_in_content), ''),
      object_id = coalesce(p_object_id, object_id),
      updated_at = now()
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Запись не найдена'; end if;
    return v_id;
  end if;

  v_num := public.registry_next_number(p_channel);
  insert into public.registry_entries(
    channel, number, object_id, counterparty,
    out_date, out_content, in_date, in_letter_no, in_content, created_by
  ) values (
    p_channel, v_num, p_object_id,
    nullif(trim(p_counterparty), ''),
    p_out_date, nullif(trim(p_out_content), ''),
    p_in_date, nullif(trim(p_in_letter_no), ''),
    nullif(trim(p_in_content), ''),
    public.current_profile_id()
  )
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.registry_soft_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.has_role('office')) then
    raise exception 'Нет прав';
  end if;
  update public.registry_entries
  set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
end $$;

grant execute on function public.registry_channel_for_request(uuid) to authenticated;
grant execute on function public.registry_next_number(text) to authenticated;
grant execute on function public.registry_out_content_from_request(uuid) to authenticated;
grant execute on function public.registry_upsert_on_sent(uuid, text, text, text) to authenticated;
grant execute on function public.registry_accept_with_response(uuid, text, text, date) to authenticated;
grant execute on function public.registry_save_entry(uuid, text, text, date, text, date, text, text, uuid) to authenticated;
grant execute on function public.registry_soft_delete(uuid) to authenticated;

-- Авто-реестр при sent из request_set_status (контент из draft; путь бланка — с клиента через upsert)
create or replace function public.tg_request_registry_on_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'sent' and (old.status is distinct from 'sent') then
    perform public.registry_upsert_on_sent(new.id);
  end if;
  return new;
end $$;

drop trigger if exists requests_registry_on_sent on public.requests;
create trigger requests_registry_on_sent
  after update of status on public.requests
  for each row
  execute function public.tg_request_registry_on_sent();
