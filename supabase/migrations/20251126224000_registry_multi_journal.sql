-- Заявка может писаться сразу в несколько журналов (мультивыбор видов).

alter table public.registry_entries drop constraint if exists registry_entries_channel_check;

drop index if exists public.registry_entries_request_uidx;
create unique index if not exists registry_entries_journal_request_uidx
  on public.registry_entries(journal_id, request_id)
  where request_id is not null and deleted_at is null;

-- Журналы для вида заявки (несколько)
create or replace function public.registry_journal_ids_for_request(p_request_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type uuid;
  v_tpl text;
  v_name text;
  v_ids uuid[];
begin
  select r.request_type_id, t.doc_template, t.name
  into v_type, v_tpl, v_name
  from public.requests r
  join public.request_types t on t.id = r.request_type_id
  where r.id = p_request_id;
  if not found then
    return array(
      select id from public.registry_journals
      where code = 'letters' and deleted_at is null and is_active
      limit 1
    );
  end if;

  select coalesce(array_agg(j.id order by j.sort), '{}'::uuid[])
  into v_ids
  from public.registry_journal_request_types jrt
  join public.registry_journals j on j.id = jrt.journal_id and j.deleted_at is null and j.is_active
  where jrt.request_type_id = v_type;

  if v_ids is not null and cardinality(v_ids) > 0 then
    return v_ids;
  end if;

  -- fallback по шаблону
  if v_tpl = 'geotrest_message' or lower(coalesce(v_name, '')) like '%геотрест%' then
    return array(select id from public.registry_journals where code = 'geotrest' and deleted_at is null limit 1);
  end if;
  if v_tpl = 'technadzor_xlsx' or lower(coalesce(v_name, '')) like '%технадзор%' then
    return array(select id from public.registry_journals where code = 'technadzor' and deleted_at is null limit 1);
  end if;
  return array(select id from public.registry_journals where code = 'letters' and deleted_at is null limit 1);
end $$;

create or replace function public.registry_journal_id_for_request(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (public.registry_journal_ids_for_request(p_request_id))[1];
$$;

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
  v_jids uuid[];
  v_jid uuid;
  v_id uuid;
  v_first uuid;
  v_num int;
  v_customer text;
  v_content text;
  v_code text;
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

  v_jids := public.registry_journal_ids_for_request(p_request_id);
  if v_jids is null or cardinality(v_jids) = 0 then
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

  foreach v_jid in array v_jids
  loop
    select code into v_code from public.registry_journals where id = v_jid;

    select id into v_id
    from public.registry_entries
    where request_id = p_request_id and journal_id = v_jid and deleted_at is null;

    if v_id is not null then
      update public.registry_entries set
        channel = coalesce(v_code, channel),
        out_date = coalesce(out_date, public.msk_today()),
        out_content = coalesce(v_content, out_content),
        out_doc_path = coalesce(nullif(trim(p_out_doc_path), ''), out_doc_path),
        counterparty = coalesce(nullif(trim(p_counterparty), ''), nullif(trim(counterparty), ''), v_customer),
        request_type_id = r.request_type_id,
        object_id = r.object_id,
        updated_at = now()
      where id = v_id;
    else
      v_num := public.registry_next_number(v_jid);
      insert into public.registry_entries(
        journal_id, channel, number, request_id, request_type_id, object_id,
        counterparty, out_date, out_content, out_doc_path, created_by
      ) values (
        v_jid, coalesce(v_code, 'letters'), v_num, r.id, r.request_type_id, r.object_id,
        coalesce(nullif(trim(p_counterparty), ''), v_customer),
        public.msk_today(),
        v_content,
        nullif(trim(p_out_doc_path), ''),
        public.current_profile_id()
      )
      returning id into v_id;

      perform public.log_history(r.object_id, 'request', r.id, 'registry_out',
        format('Реестр «%s»: исходящее №%s', coalesce(v_code, '?'), v_num));
    end if;

    if v_first is null then v_first := v_id; end if;
  end loop;

  return v_first;
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

  update public.registry_entries set
    in_date = v_date,
    in_letter_no = nullif(trim(p_letter_no), ''),
    in_content = nullif(trim(p_content), ''),
    extra = coalesce(extra, '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb),
    updated_at = now()
  where request_id = p_request_id and deleted_at is null;

  if r.status = 'sent' then
    perform public.request_set_status(p_request_id, 'accepted', null);
  end if;

  perform public.log_history(r.object_id, 'request', r.id, 'registry_in',
    format('Реестр: входящий ответ%s',
      case when nullif(trim(p_letter_no), '') is not null
        then format(' №%s', trim(p_letter_no)) else '' end));
end $$;

-- Сохранение журнала: мультивыбор без снятия с других журналов
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
  v_exists uuid;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Укажите название'; end if;
  if v_code is null or v_code !~ '^[a-z][a-z0-9_]{0,31}$' then
    raise exception 'Код: латиница, цифры и _ , с маленькой буквы (например letters2)';
  end if;

  select id into v_exists
  from public.registry_journals
  where code = v_code and deleted_at is null
    and (p_id is null or id is distinct from p_id)
  limit 1;
  if v_exists is not null then
    raise exception 'Журнал с кодом «%» уже есть. Откройте его в списке или придумайте другой код', v_code;
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

grant execute on function public.registry_journal_ids_for_request(uuid) to authenticated;

-- вернуть Лабораторию МГ в «Письма» (плюс lettersr уже есть)
insert into public.registry_journal_request_types(journal_id, request_type_id)
select j.id, t.id
from public.registry_journals j
cross join public.request_types t
where j.code = 'letters' and j.deleted_at is null
  and t.name = 'Лаборатория МГ' and t.deleted_at is null
on conflict do nothing;

-- дозаполнить строку №30 во втором журнале, если ещё нет
insert into public.registry_entries(
  journal_id, channel, number, request_id, request_type_id, object_id,
  counterparty, out_date, out_content, out_doc_path, created_by, extra
)
select
  j.id, j.code,
  public.registry_next_number(j.id),
  e.request_id, e.request_type_id, e.object_id,
  e.counterparty, e.out_date, e.out_content, e.out_doc_path, e.created_by, e.extra
from public.registry_entries e
join public.requests r on r.id = e.request_id and r.number = 30
cross join public.registry_journals j
where j.code = 'letters' and j.deleted_at is null
  and e.deleted_at is null
  and not exists (
    select 1 from public.registry_entries x
    where x.request_id = e.request_id and x.journal_id = j.id and x.deleted_at is null
  )
limit 1;
