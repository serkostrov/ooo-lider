-- =============================================================================
-- SPAM REQUESTS · локально для теста курсорной пагинации / infinite scroll
-- Не трогает справочники и объекты. Добавляет ~400 заявок на существующие объекты.
-- Повторный запуск добавит ещё столько же.
-- Скопируй в Studio SQL Editor или: psql "$DB_URL" -f этот_файл
-- =============================================================================

do $$
declare
  v_count int := 400; -- сколько заявок наспамить
  v_objs uuid[];
  v_types record;
  v_type_ids uuid[];
  v_type_names text[];
  v_statuses text[] := array['new','new','new','ready','sent','accepted','done','done'];
  v_initiators uuid[];
  v_offices uuid[];
  v_obj uuid;
  v_type_id uuid;
  v_type_name text;
  v_status text;
  v_call date;
  v_created timestamptz;
  v_idx int;
  v_i int;
  v_today date := public.msk_today();
  v_initiator uuid;
  v_office uuid;
  v_inserted int := 0;
begin
  perform set_config('lider.rpc', 'on', true);

  select coalesce(array_agg(id order by name), '{}') into v_objs
  from public.objects
  where deleted_at is null and status <> 'completed';

  if coalesce(cardinality(v_objs), 0) = 0 then
    raise exception 'Нет активных объектов — сначала залей wipe_and_reseed_demo.sql';
  end if;

  select coalesce(array_agg(id order by sort), '{}'),
         coalesce(array_agg(name order by sort), '{}')
  into v_type_ids, v_type_names
  from public.request_types
  where deleted_at is null and is_active;

  if coalesce(cardinality(v_type_ids), 0) = 0 then
    raise exception 'Нет видов заявок';
  end if;

  select coalesce(array_agg(id), '{}') into v_initiators
  from public.profiles
  where deleted_at is null and is_active and role_code in ('foreman', 'pto', 'admin');

  select coalesce(array_agg(id), '{}') into v_offices
  from public.profiles
  where deleted_at is null and is_active and role_code in ('office', 'admin');

  if cardinality(v_initiators) = 0 then
    select coalesce(array_agg(id), '{}') into v_initiators
    from public.profiles where deleted_at is null and is_active;
  end if;
  if cardinality(v_offices) = 0 then
    v_offices := v_initiators;
  end if;

  for v_i in 1..v_count loop
    v_obj := v_objs[1 + ((v_i - 1) % cardinality(v_objs))];
    v_idx := 1 + ((v_i - 1) % cardinality(v_type_ids));
    v_type_id := v_type_ids[v_idx];
    v_type_name := v_type_names[v_idx];
    v_status := v_statuses[1 + ((v_i - 1) % cardinality(v_statuses))];
    v_call := v_today + ((v_i % 60) - 30); -- от −30 до +29 дней
    v_created := least(
      ((v_today - (v_i % 45))::timestamp + make_time(8 + (v_i % 8), v_i % 60, 0))
        at time zone 'Europe/Moscow',
      now() - interval '5 minutes'
    );
    v_initiator := v_initiators[1 + ((v_i - 1) % cardinality(v_initiators))];
    v_office := v_offices[1 + ((v_i - 1) % cardinality(v_offices))];

    insert into public.requests(
      object_id, request_type_id, type_name,
      initiator_id, office_id, call_date, status,
      sent_at, accepted_at, done_at, done_by,
      result_text, created_at, seen_at
    ) values (
      v_obj, v_type_id, v_type_name,
      v_initiator,
      case when v_status in ('sent','accepted','done') then v_office else null end,
      v_call,
      v_status,
      case when v_status in ('sent','accepted','done') then v_created + interval '1 day' end,
      case when v_status in ('accepted','done') then v_created + interval '2 days' end,
      case when v_status = 'done' then least(v_created + interval '3 days', now() - interval '1 hour') end,
      case when v_status = 'done' then v_office end,
      case when v_status = 'done' then 'П-' || lpad((1000 + v_i)::text, 5, '0') end,
      v_created,
      case when v_status = 'new' and (v_i % 3 = 0) then null else now() end -- часть «Новых» непросмотренных
    );
    v_inserted := v_inserted + 1;
  end loop;

  raise notice 'Добавлено заявок: % (всего сейчас: %)',
    v_inserted,
    (select count(*) from public.requests where deleted_at is null);
end $$;

select
  count(*) as total,
  count(*) filter (where status = 'new') as new_cnt,
  count(*) filter (where status <> 'done' and call_date < public.msk_today()) as overdue_cnt,
  count(*) filter (where status = 'done') as done_cnt
from public.v_requests;
