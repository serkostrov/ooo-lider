-- Универсальные журналы реестра: настраиваемые поля + привязка видов заявок.

create table if not exists public.registry_journals (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  sort int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint registry_journals_code_chk check (code ~ '^[a-z][a-z0-9_]{0,31}$')
);

create unique index if not exists registry_journals_code_uidx
  on public.registry_journals(code) where deleted_at is null;

create trigger registry_journals_updated before update on public.registry_journals
  for each row execute function public.tg_set_updated_at();

-- Поля журнала. system_key → колонка registry_entries; иначе значение в extra.
create table if not exists public.registry_journal_fields (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.registry_journals(id) on delete cascade,
  label text not null,
  field_type text not null check (field_type in ('text','number','date','select','textarea')),
  system_key text check (
    system_key is null
    or system_key in (
      'counterparty','out_date','out_content','in_date','in_letter_no','in_content'
    )
  ),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  show_in_table boolean not null default true,
  show_on_accept boolean not null default false,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists registry_journal_fields_system_uidx
  on public.registry_journal_fields(journal_id, system_key)
  where deleted_at is null and system_key is not null;

create index if not exists registry_journal_fields_journal_idx
  on public.registry_journal_fields(journal_id)
  where deleted_at is null;

create trigger registry_journal_fields_updated before update on public.registry_journal_fields
  for each row execute function public.tg_set_updated_at();

create table if not exists public.registry_journal_request_types (
  journal_id uuid not null references public.registry_journals(id) on delete cascade,
  request_type_id uuid not null references public.request_types(id) on delete cascade,
  primary key (journal_id, request_type_id)
);

alter table public.registry_journals enable row level security;
alter table public.registry_journal_fields enable row level security;
alter table public.registry_journal_request_types enable row level security;

create policy registry_journals_select on public.registry_journals
  for select to authenticated using (deleted_at is null);
create policy registry_journals_write on public.registry_journals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy registry_journal_fields_select on public.registry_journal_fields
  for select to authenticated using (deleted_at is null);
create policy registry_journal_fields_write on public.registry_journal_fields
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy registry_journal_rt_select on public.registry_journal_request_types
  for select to authenticated using (true);
create policy registry_journal_rt_write on public.registry_journal_request_types
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seed журналов из старых channel
insert into public.registry_journals(code, name, sort)
values
  ('letters', 'Письма', 10),
  ('technadzor', 'Технадзор', 20),
  ('geotrest', 'Геотрест', 30)
on conflict do nothing;

-- На случай если unique по code через partial index и on conflict не сработал
insert into public.registry_journals(code, name, sort)
select v.code, v.name, v.sort
from (values
  ('letters', 'Письма', 10),
  ('technadzor', 'Технадзор', 20),
  ('geotrest', 'Геотрест', 30)
) as v(code, name, sort)
where not exists (
  select 1 from public.registry_journals j where j.code = v.code and j.deleted_at is null
);

-- Системные поля
do $$
declare
  j record;
  v_letter_label text;
begin
  for j in select id, code from public.registry_journals where deleted_at is null
  loop
    v_letter_label := case when j.code = 'geotrest' then 'Спецномер' else '№ письма' end;

    if not exists (
      select 1 from public.registry_journal_fields f
      where f.journal_id = j.id and f.system_key = 'counterparty' and f.deleted_at is null
    ) then
      insert into public.registry_journal_fields(journal_id, label, field_type, system_key, sort, show_in_table, show_on_accept)
      values
        (j.id, 'Контрагент', 'text', 'counterparty', 10, true, false),
        (j.id, 'Дата исходящего', 'date', 'out_date', 20, true, false),
        (j.id, 'Исходящее', 'textarea', 'out_content', 30, true, false),
        (j.id, 'Дата входящего', 'date', 'in_date', 40, true, true),
        (j.id, v_letter_label, 'text', 'in_letter_no', 50, true, true),
        (j.id, 'Входящее', 'textarea', 'in_content', 60, true, true);
    end if;

    -- Геотрест: спецномер обязателен при ответе
    if j.code = 'geotrest' then
      update public.registry_journal_fields
      set is_required = true, show_on_accept = true
      where journal_id = j.id and system_key = 'in_letter_no' and deleted_at is null;
      update public.registry_journal_fields
      set is_required = true, show_on_accept = true
      where journal_id = j.id and system_key = 'in_content' and deleted_at is null;
    else
      update public.registry_journal_fields
      set is_required = true, show_on_accept = true
      where journal_id = j.id and system_key = 'in_content' and deleted_at is null;
    end if;
  end loop;
end $$;

-- Привязка видов заявок по шаблону/имени
insert into public.registry_journal_request_types(journal_id, request_type_id)
select j.id, t.id
from public.request_types t
cross join public.registry_journals j
where j.deleted_at is null and t.deleted_at is null
  and (
    (j.code = 'geotrest' and (t.doc_template = 'geotrest_message' or lower(t.name) like '%геотрест%'))
    or (j.code = 'technadzor' and (t.doc_template = 'technadzor_xlsx' or lower(t.name) like '%технадзор%'))
    or (j.code = 'letters' and coalesce(t.doc_template, '') not in ('geotrest_message', 'technadzor_xlsx')
        and lower(t.name) not like '%геотрест%' and lower(t.name) not like '%технадзор%')
  )
on conflict do nothing;

-- Колонки journal_id + extra
alter table public.registry_entries
  add column if not exists journal_id uuid references public.registry_journals(id),
  add column if not exists extra jsonb not null default '{}'::jsonb;

update public.registry_entries e
set journal_id = j.id
from public.registry_journals j
where e.journal_id is null
  and j.code = e.channel
  and j.deleted_at is null;

-- Если остались без journal — letters
update public.registry_entries e
set journal_id = (select id from public.registry_journals where code = 'letters' and deleted_at is null limit 1)
where e.journal_id is null;

alter table public.registry_entries
  alter column journal_id set not null;

create unique index if not exists registry_entries_journal_number_uidx
  on public.registry_entries(journal_id, number)
  where deleted_at is null;

create index if not exists registry_entries_journal_idx
  on public.registry_entries(journal_id)
  where deleted_at is null;

-- --- RPC ---

create or replace function public.registry_journal_id_for_request(p_request_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type uuid;
  v_jid uuid;
  v_tpl text;
  v_name text;
begin
  select r.request_type_id, t.doc_template, t.name
  into v_type, v_tpl, v_name
  from public.requests r
  join public.request_types t on t.id = r.request_type_id
  where r.id = p_request_id;
  if not found then
    return (select id from public.registry_journals where code = 'letters' and deleted_at is null limit 1);
  end if;

  select jrt.journal_id into v_jid
  from public.registry_journal_request_types jrt
  join public.registry_journals j on j.id = jrt.journal_id and j.deleted_at is null and j.is_active
  where jrt.request_type_id = v_type
  order by j.sort
  limit 1;
  if v_jid is not null then return v_jid; end if;

  -- fallback по шаблону (как раньше)
  if v_tpl = 'geotrest_message' or lower(coalesce(v_name, '')) like '%геотрест%' then
    return (select id from public.registry_journals where code = 'geotrest' and deleted_at is null limit 1);
  end if;
  if v_tpl = 'technadzor_xlsx' or lower(coalesce(v_name, '')) like '%технадзор%' then
    return (select id from public.registry_journals where code = 'technadzor' and deleted_at is null limit 1);
  end if;
  return (select id from public.registry_journals where code = 'letters' and deleted_at is null limit 1);
end $$;

-- совместимость: channel code
create or replace function public.registry_channel_for_request(p_request_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  select j.code into v_code
  from public.registry_journals j
  where j.id = public.registry_journal_id_for_request(p_request_id);
  return coalesce(v_code, 'letters');
end $$;

create or replace function public.registry_next_number(p_journal_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(number), 0) + 1
  from public.registry_entries
  where journal_id = p_journal_id and deleted_at is null;
$$;

-- старая сигнатура next_number(text) → через code
create or replace function public.registry_next_number(p_channel text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from public.registry_journals where code = p_channel and deleted_at is null;
  if v_id is null then return 1; end if;
  return public.registry_next_number(v_id);
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
  v_jid uuid;
  v_id uuid;
  v_num int;
  v_customer text;
  v_content text;
begin
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

  v_jid := public.registry_journal_id_for_request(p_request_id);
  if v_jid is null then
    raise exception 'Для этого вида заявки не настроен журнал реестра';
  end if;

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
      journal_id = v_jid,
      channel = coalesce((select code from public.registry_journals where id = v_jid), channel),
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

  v_num := public.registry_next_number(v_jid);
  insert into public.registry_entries(
    journal_id, channel, number, request_id, request_type_id, object_id,
    counterparty, out_date, out_content, out_doc_path, created_by
  ) values (
    v_jid,
    coalesce((select code from public.registry_journals where id = v_jid), 'letters'),
    v_num, r.id, r.request_type_id, r.object_id,
    coalesce(nullif(trim(p_counterparty), ''), v_customer),
    public.msk_today(),
    v_content,
    nullif(trim(p_out_doc_path), ''),
    public.current_profile_id()
  )
  returning id into v_id;

  perform public.log_history(r.object_id, 'request', r.id, 'registry_out',
    format('Реестр: исходящее №%s', v_num));

  return v_id;
end $$;

create or replace function public.registry_accept_with_response(
  p_request_id uuid,
  p_letter_no text,
  p_content text,
  p_date date default null,
  p_extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
  v_jid uuid;
  v_id uuid;
  v_date date := coalesce(p_date, public.msk_today());
  v_need_letter boolean := false;
  v_need_content boolean := false;
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

  v_jid := public.registry_journal_id_for_request(p_request_id);

  select coalesce(bool_or(f.is_required and f.system_key = 'in_letter_no'), false),
         coalesce(bool_or(f.is_required and f.system_key = 'in_content'), false)
  into v_need_letter, v_need_content
  from public.registry_journal_fields f
  where f.journal_id = v_jid and f.deleted_at is null and f.show_on_accept;

  if v_need_letter and coalesce(trim(p_letter_no), '') = '' then
    raise exception 'Укажите спецномер / № письма';
  end if;
  if v_need_content and coalesce(trim(p_content), '') = '' then
    raise exception 'Укажите текст ответа';
  end if;

  perform public.registry_upsert_on_sent(p_request_id);

  select id into v_id
  from public.registry_entries
  where request_id = p_request_id and deleted_at is null;

  update public.registry_entries set
    in_date = v_date,
    in_letter_no = nullif(trim(p_letter_no), ''),
    in_content = nullif(trim(p_content), ''),
    extra = coalesce(extra, '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb),
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

-- Перегрузка без p_extra (старые клиенты)
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
begin
  perform public.registry_accept_with_response(p_request_id, p_letter_no, p_content, p_date, '{}'::jsonb);
end $$;

create or replace function public.registry_save_entry(
  p_id uuid,
  p_journal_id uuid,
  p_counterparty text,
  p_out_date date,
  p_out_content text,
  p_in_date date,
  p_in_letter_no text,
  p_in_content text,
  p_object_id uuid default null,
  p_extra jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_num int;
  v_code text;
begin
  if not (public.is_admin() or public.has_role('office')) then
    raise exception 'Нет прав';
  end if;
  if p_journal_id is null then
    raise exception 'Укажите журнал';
  end if;
  select code into v_code from public.registry_journals where id = p_journal_id and deleted_at is null;
  if v_code is null then raise exception 'Журнал не найден'; end if;

  if p_id is not null then
    update public.registry_entries set
      journal_id = p_journal_id,
      channel = v_code,
      counterparty = nullif(trim(p_counterparty), ''),
      out_date = p_out_date,
      out_content = nullif(trim(p_out_content), ''),
      in_date = p_in_date,
      in_letter_no = nullif(trim(p_in_letter_no), ''),
      in_content = nullif(trim(p_in_content), ''),
      object_id = coalesce(p_object_id, object_id),
      extra = coalesce(p_extra, '{}'::jsonb),
      updated_at = now()
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Запись не найдена'; end if;
    return v_id;
  end if;

  v_num := public.registry_next_number(p_journal_id);
  insert into public.registry_entries(
    journal_id, channel, number, object_id, counterparty,
    out_date, out_content, in_date, in_letter_no, in_content, extra, created_by
  ) values (
    p_journal_id, v_code, v_num, p_object_id,
    nullif(trim(p_counterparty), ''),
    p_out_date, nullif(trim(p_out_content), ''),
    p_in_date, nullif(trim(p_in_letter_no), ''),
    nullif(trim(p_in_content), ''),
    coalesce(p_extra, '{}'::jsonb),
    public.current_profile_id()
  )
  returning id into v_id;
  return v_id;
end $$;

-- CRUD журналов
create or replace function public.registry_save_journal(
  p_id uuid,
  p_code text,
  p_name text,
  p_sort int default 100,
  p_is_active boolean default true,
  p_request_type_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := lower(trim(p_code));
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Укажите название'; end if;
  if v_code is null or v_code !~ '^[a-z][a-z0-9_]{0,31}$' then
    raise exception 'Код: латиница, цифры, _ (с маленькой буквы)';
  end if;

  if p_id is not null then
    update public.registry_journals set
      code = v_code,
      name = trim(p_name),
      sort = coalesce(p_sort, sort),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Журнал не найден'; end if;
  else
    insert into public.registry_journals(code, name, sort, is_active)
    values (v_code, trim(p_name), coalesce(p_sort, 100), coalesce(p_is_active, true))
    returning id into v_id;

    -- базовые системные поля для нового журнала
    insert into public.registry_journal_fields(journal_id, label, field_type, system_key, sort, show_in_table, show_on_accept, is_required)
    values
      (v_id, 'Контрагент', 'text', 'counterparty', 10, true, false, false),
      (v_id, 'Дата исходящего', 'date', 'out_date', 20, true, false, false),
      (v_id, 'Исходящее', 'textarea', 'out_content', 30, true, false, false),
      (v_id, 'Дата входящего', 'date', 'in_date', 40, true, true, false),
      (v_id, '№ письма', 'text', 'in_letter_no', 50, true, true, false),
      (v_id, 'Входящее', 'textarea', 'in_content', 60, true, true, true);
  end if;

  delete from public.registry_journal_request_types where journal_id = v_id;
  if p_request_type_ids is not null and cardinality(p_request_type_ids) > 0 then
    insert into public.registry_journal_request_types(journal_id, request_type_id)
    select v_id, x from unnest(p_request_type_ids) as x
    on conflict do nothing;
  end if;

  return v_id;
end $$;

create or replace function public.registry_save_journal_field(
  p_id uuid,
  p_journal_id uuid,
  p_label text,
  p_field_type text,
  p_system_key text default null,
  p_options jsonb default '[]'::jsonb,
  p_is_required boolean default false,
  p_show_in_table boolean default true,
  p_show_on_accept boolean default false,
  p_sort int default 100
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  if coalesce(trim(p_label), '') = '' then raise exception 'Укажите название поля'; end if;
  if p_field_type not in ('text','number','date','select','textarea') then
    raise exception 'Неизвестный тип поля';
  end if;
  if p_system_key is not null and p_system_key not in (
    'counterparty','out_date','out_content','in_date','in_letter_no','in_content'
  ) then
    raise exception 'Неизвестный system_key';
  end if;

  if p_id is not null then
    update public.registry_journal_fields set
      label = trim(p_label),
      field_type = p_field_type,
      options = coalesce(p_options, '[]'::jsonb),
      is_required = coalesce(p_is_required, false),
      show_in_table = coalesce(p_show_in_table, true),
      show_on_accept = coalesce(p_show_on_accept, false),
      sort = coalesce(p_sort, sort),
      updated_at = now()
    where id = p_id and deleted_at is null and journal_id = p_journal_id
    returning id into v_id;
    if v_id is null then raise exception 'Поле не найдено'; end if;
    return v_id;
  end if;

  if p_system_key is not null then
    raise exception 'Системные поля создаются автоматически';
  end if;

  insert into public.registry_journal_fields(
    journal_id, label, field_type, system_key, options,
    is_required, show_in_table, show_on_accept, sort
  ) values (
    p_journal_id, trim(p_label), p_field_type, null, coalesce(p_options, '[]'::jsonb),
    coalesce(p_is_required, false), coalesce(p_show_in_table, true),
    coalesce(p_show_on_accept, false), coalesce(p_sort, 100)
  )
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.registry_soft_delete_journal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  update public.registry_journals set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
end $$;

create or replace function public.registry_soft_delete_journal_field(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sys text;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  select system_key into v_sys from public.registry_journal_fields where id = p_id and deleted_at is null;
  if v_sys is not null then
    raise exception 'Системное поле удалить нельзя — скройте из таблицы';
  end if;
  update public.registry_journal_fields set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
end $$;

grant execute on function public.registry_journal_id_for_request(uuid) to authenticated;
grant execute on function public.registry_channel_for_request(uuid) to authenticated;
grant execute on function public.registry_next_number(uuid) to authenticated;
grant execute on function public.registry_next_number(text) to authenticated;
grant execute on function public.registry_upsert_on_sent(uuid, text, text, text) to authenticated;
grant execute on function public.registry_accept_with_response(uuid, text, text, date, jsonb) to authenticated;
grant execute on function public.registry_accept_with_response(uuid, text, text, date) to authenticated;
grant execute on function public.registry_save_entry(uuid, uuid, text, date, text, date, text, text, uuid, jsonb) to authenticated;
grant execute on function public.registry_save_journal(uuid, text, text, int, boolean, uuid[]) to authenticated;
grant execute on function public.registry_save_journal_field(uuid, uuid, text, text, text, jsonb, boolean, boolean, boolean, int) to authenticated;
grant execute on function public.registry_soft_delete_journal(uuid) to authenticated;
grant execute on function public.registry_soft_delete_journal_field(uuid) to authenticated;

-- старая registry_save_entry(channel text...) — оставить обёртку для совместимости
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
declare v_jid uuid;
begin
  select id into v_jid from public.registry_journals where code = p_channel and deleted_at is null;
  if v_jid is null then raise exception 'Неизвестный раздел реестра'; end if;
  return public.registry_save_entry(
    p_id, v_jid, p_counterparty, p_out_date, p_out_content,
    p_in_date, p_in_letter_no, p_in_content, p_object_id, '{}'::jsonb
  );
end $$;

grant execute on function public.registry_save_entry(uuid, text, text, date, text, date, text, text, uuid) to authenticated;
