-- =====================================================================
-- ООО «Лидер» · Демо-данные для показа заказчику (правка 1.5, docs/ПРАВКИ.md)
-- Выполнить один раз ПОСЛЕ db/02_fixes.sql в Supabase → SQL Editor (весь файл целиком).
--
-- Что появится:
--   • нормативные сроки и роли у этапов справочника (только где пусто);
--   • сотрудники с ФИО; тестовые «Прораб (тест)» и «Снабжение (тест)» получают ФИО;
--   • 6 объектов: в работе, у срока договора, ранний этап, просроченный,
--     планируемый и завершённый (в архиве);
--   • около 30 заявок всех видов и статусов, переписка, история с датами и авторами.
-- Прораб с логином участвует в 5 объектах из 6 — под ним видно ограничение доступа.
-- Все даты считаются от сегодняшнего дня, подсветка будет «живой» в день показа.
-- Объекты «ТЕСТ · …» не трогаются (скрыть их — db/05_hide_test_objects.sql).
-- =====================================================================

-- ---------- Вспомогательные функции (временные, исчезают после сеанса) ----------

-- Момент времени по Москве: дата + час
create or replace function pg_temp.at(p_day date, p_hour int) returns timestamptz
language sql immutable as $$ select (p_day + make_time(p_hour, 0, 0)) at time zone 'Europe/Moscow' $$;

create or replace function pg_temp.pid(p_name text) returns uuid
language sql stable as $$ select id from public.profiles where full_name = p_name and deleted_at is null limit 1 $$;

-- Сотрудник: по точному имени → по началу имени → первый активный с этой ролью → создать.
-- Так скрипт работает, даже если сотрудников переименовали или удалили при тестировании.
create or replace function pg_temp.person(p_name text, p_role text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from public.profiles where full_name = p_name and deleted_at is null limit 1;
  if v is null then
    select id into v from public.profiles
    where full_name ilike split_part(p_name, ' ', 1) || '%' and deleted_at is null and is_active limit 1;
  end if;
  if v is null then
    select id into v from public.profiles where role_code = p_role and deleted_at is null and is_active
    order by user_id is null, created_at limit 1;
  end if;
  if v is null then
    insert into public.profiles(full_name, role_code) values (p_name, p_role) returning id into v;
  end if;
  return v;
end $$;

create or replace function pg_temp.sid(p_obj uuid, p_no int) returns uuid
language sql stable as $$ select id from public.object_stages where object_id = p_obj and number = p_no and deleted_at is null $$;

create or replace function pg_temp.log(p_obj uuid, p_type text, p_entity uuid, p_action text,
  p_msg text, p_actor uuid, p_at timestamptz) returns void
language sql as $$
  insert into public.history(object_id, entity_type, entity_id, action, message, actor_id, created_at)
  values (p_obj, p_type, p_entity, p_action, p_msg, p_actor, p_at) $$;

-- Закрыть этапы с p_from по p_to: даты подряд от сегодня + p_start_off с шагом p_step дней
create or replace function pg_temp.close_range(p_obj uuid, p_from int, p_to int,
  p_start_off int, p_step int, p_closer uuid) returns void
language plpgsql as $$
declare
  s record; i int := 0; v_today date := public.msk_today();
  v_start date; v_due date; v_closed date; v_actor uuid;
begin
  perform set_config('lider.rpc', 'on', true);
  for s in select * from public.object_stages
           where object_id = p_obj and number between p_from and p_to and deleted_at is null and not is_excluded
           order by number
  loop
    v_start  := v_today + p_start_off + i * p_step;
    v_due    := v_start + coalesce(s.duration_days, 7);
    v_closed := least(v_start + greatest(1, coalesce(s.duration_days, 7) - 1), v_today - 1);
    v_actor  := coalesce(s.executor_id, p_closer);

    update public.object_stages set
      status_code = 'closed', start_date = v_start, due_date = v_due,
      doc_sent_at = case when expected_doc is not null then v_start + 1 end,
      response_received_at = case when expected_doc is not null then least(v_start + 3, v_closed) end,
      confirmer_id = coalesce(confirmer_id, p_closer),
      closed_at = pg_temp.at(v_closed, 16), closed_by = p_closer
    where id = s.id;
    update public.object_stage_conditions set is_done = true, done_by = v_actor,
           done_at = pg_temp.at(v_closed, 11),
           value_text = case when kind = 'field' then coalesce(value_text, 'внесено') else value_text end
    where stage_id = s.id and deleted_at is null;
    update public.object_stage_steps set state = 'done', done_by = v_actor, done_at = pg_temp.at(v_closed, 10)
    where stage_id = s.id;

    perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
      format('Этап %s «%s»: В работе', s.number, s.name), v_actor, pg_temp.at(v_start, 9));
    perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
      format('Этап %s «%s»: На проверке', s.number, s.name), v_actor, pg_temp.at(v_closed, 12));
    perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
      format('Этап %s «%s»: Закрыто', s.number, s.name), p_closer, pg_temp.at(v_closed, 16));
    i := i + 1;
  end loop;
end $$;

-- Этап в работе: статус, даты (смещения от сегодня), документ и ответ, заметка, «вне очереди»
create or replace function pg_temp.stage(p_obj uuid, p_no int, p_status text,
  p_start_off int, p_due_off int, p_sent_off int default null, p_resp_days int default null,
  p_note text default null, p_out_of_order boolean default false, p_remind int default null) returns void
language plpgsql as $$
declare
  s public.object_stages; v_today date := public.msk_today(); v_total int; v_done int; v_actor uuid;
  v_status_name text;
begin
  perform set_config('lider.rpc', 'on', true);
  select * into s from public.object_stages where object_id = p_obj and number = p_no and deleted_at is null;
  if not found then return; end if;
  v_actor := s.executor_id;

  update public.object_stages set
    status_code = p_status,
    start_date = v_today + p_start_off, due_date = v_today + p_due_off,
    doc_sent_at = case when p_sent_off is not null then v_today + p_sent_off end,
    response_days = coalesce(p_resp_days, response_days),
    remind_days = coalesce(p_remind, remind_days),
    note = p_note, out_of_order = p_out_of_order
  where id = s.id;

  -- Условия: на проверке — все, в работе — первая половина
  select count(*) into v_total from public.object_stage_conditions where stage_id = s.id and deleted_at is null;
  v_done := case when p_status = 'on_review' then v_total else v_total / 2 end;
  update public.object_stage_conditions c set is_done = true, done_by = v_actor,
         done_at = pg_temp.at(v_today + p_start_off + 1, 14),
         value_text = case when c.kind = 'field' then coalesce(c.value_text, 'внесено') else c.value_text end
  where c.id in (select id from public.object_stage_conditions where stage_id = s.id and deleted_at is null
                 order by sort limit v_done);

  perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
    format('Этап %s «%s»: В работе', s.number, s.name), v_actor, pg_temp.at(v_today + p_start_off, 9));
  if p_status <> 'in_work' then
    select name into v_status_name from public.stage_statuses where code = p_status;
    perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
      format('Этап %s «%s»: %s', s.number, s.name, v_status_name), v_actor,
      pg_temp.at(coalesce(v_today + p_sent_off, v_today - 1), 15));
  end if;
end $$;

-- Заявка с историей: статус, даты (смещения от сегодня), значения полей по подписям
create or replace function pg_temp.request(p_obj uuid, p_type text, p_status text,
  p_created_ago int, p_call_off int, p_initiator uuid, p_office uuid, p_values jsonb,
  p_result text default null, p_rep text default null, p_stage_no int default null,
  p_comment text default null) returns void
language plpgsql as $$
declare
  t public.request_types; v_id uuid; v_no bigint; v_today date := public.msk_today();
  v_created timestamptz := least(pg_temp.at(v_today - p_created_ago, 9) + interval '25 min', now() - interval '10 min');
  v_order text[] := array['new','ready','sent','accepted','done'];
  v_names text[] := array['Новая','Готова к отправке','Отправлена','Принята заказчиком','Исполнена'];
  v_idx int := array_position(v_order, p_status);
  v_step_at timestamptz; f record; k int;
begin
  select * into t from public.request_types where name = p_type and deleted_at is null limit 1;
  if not found then raise exception 'Нет вида заявки «%»', p_type; end if;

  -- шаги идут через сутки после создания, но не позже вчерашнего дня
  insert into public.requests(object_id, request_type_id, type_name, representative_id, stage_id,
    initiator_id, office_id, call_date, status, sent_at, accepted_at, done_at, done_by, result_text, created_at)
  values (p_obj, t.id, t.name,
    (select id from public.representatives where name = p_rep and deleted_at is null limit 1),
    pg_temp.sid(p_obj, p_stage_no),
    p_initiator, case when v_idx >= 2 then p_office end,
    v_today + p_call_off, p_status,
    case when v_idx >= 3 then least(v_created + interval '1 day', now() - interval '20 hours') end,
    case when v_idx >= 4 then least(v_created + interval '2 days', now() - interval '16 hours') end,
    case when v_idx = 5 then least(pg_temp.at(v_today + p_call_off, 17), now() - interval '2 hours') end,
    case when v_idx = 5 then p_office end,
    p_result, v_created)
  returning id, number into v_id, v_no;

  -- значения полей: снимок подписи и типа, как в request_save_values()
  for f in select * from public.request_type_fields
           where request_type_id = t.id and deleted_at is null and p_values ? label
  loop
    insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by, updated_at)
    values (v_id, f.id, f.label, f.field_type, p_values -> f.label,
            case when f.filled_by = 'office' then p_office else p_initiator end, v_created);
  end loop;
  if p_result is not null then
    insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by, updated_at)
    select v_id, tf.id, tf.label, tf.field_type, to_jsonb(p_result), p_office, v_created
    from public.request_type_fields tf
    where tf.request_type_id = t.id and tf.label = 'Номер протокола' and tf.deleted_at is null
    on conflict (request_id, field_id) do nothing;
  end if;

  perform pg_temp.log(p_obj, 'request', v_id, 'created',
    format('Заявка №%s «%s» создана, вызов на %s', v_no, t.name, to_char(v_today + p_call_off, 'DD.MM.YYYY')),
    p_initiator, v_created);
  for k in 2..v_idx loop
    v_step_at := least(v_created + (k - 1) * interval '1 day' - interval '3 hours', now() - interval '1 hour');
    perform pg_temp.log(p_obj, 'request', v_id, 'status_changed',
      format('Заявка №%s «%s»: %s', v_no, t.name, v_names[k]), p_office, v_step_at);
  end loop;

  if p_comment is not null then
    insert into public.request_comments(request_id, author_id, text, created_at)
    values (v_id, p_office, p_comment, least(v_created + interval '1 day 2 hours', now() - interval '30 min'));
  end if;
end $$;

-- ---------- Наполнение ----------
do $$
declare
  v_admin_uid uuid; v_admin uuid; v_today date := public.msk_today();
  v_nikitin uuid; v_sergeev uuid; v_kovalev uuid; v_galina uuid; v_belova uuid;
  v_milana uuid; v_muslim uuid; v_fomina uuid;
  v_mosgaz uuid; v_sever uuid; v_prom uuid; v_alfa uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; o6 uuid;
begin
  -- Без исправления из 02_fixes.sql любое изменение этапа или заявки падает («record "new" has no field»)
  if not exists (select 1 from pg_proc where proname = 'tg_guard_status'
                 and prosrc like '%elsif tg_table_name = ''requests'' then%') then
    raise exception 'Сначала выполните db/02_fixes.sql (исправление триггера статусов), затем запустите этот файл снова';
  end if;
  if exists (select 1 from public.objects where name like 'Газопровод среднего давления по ул. Профсоюзной%' and deleted_at is null) then
    raise exception 'Демо-данные уже загружены — повторный запуск не нужен';
  end if;

  -- Действуем от имени администратора: функции БД проверяют права и пишут автора в историю
  select p.user_id, p.id into v_admin_uid, v_admin
  from public.profiles p join public.roles r on r.code = p.role_code
  where r.is_admin and p.user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  if v_admin_uid is null then raise exception 'Не найден администратор с логином (см. 01_after_migration.sql)'; end if;
  perform set_config('request.jwt.claim.sub', v_admin_uid::text, true);

  -- 1. Нормативы этапов справочника — только там, где пусто (заказчик заменит своими)
  update public.stage_templates st set
    duration_days  = coalesce(st.duration_days, n.dur),
    executor_role  = coalesce(st.executor_role, n.exec),
    confirmer_role = coalesce(st.confirmer_role, n.conf),
    response_days  = coalesce(st.response_days, case when st.expected_doc is not null then n.resp end),
    remind_days    = coalesce(st.remind_days, n.remind)
  from public.work_types w
  join (values
    ('Тендер и договор',              10, 'pto',     'director', 7,  3),
    ('Документация и согласования',   14, 'pto',     'director', 10, 3),
    ('Геодезия и съёмки',              5, 'foreman', 'pto',      5,  2),
    ('Земляные работы',               10, 'foreman', 'pto',      5,  2),
    ('Сварочно-монтажные работы',     12, 'foreman', 'pto',      5,  2),
    ('Испытания и просвет стыков',     5, 'foreman', 'pto',      5,  2),
    ('Химзащита (ЭХЗ)',                7, 'foreman', 'pto',      7,  2),
    ('Врезка и сдача',                 7, 'foreman', 'director', 7,  2),
    ('Благоустройство и озеленение',  14, 'foreman', 'director', 10, 3),
    ('Папка ИД и форма 6',            10, 'pto',     'director', 14, 3)
  ) as n(wt, dur, exec, conf, resp, remind) on n.wt = w.name
  where st.work_type_id = w.id and st.deleted_at is null;

  -- Второй пример сценария — «Комиссионный акт — бегунок по службам» (этап 39)
  insert into public.stage_template_steps(template_id, step_no, role_code, action, action_kind, duration_days)
  select st.id, s.step_no, s.role_code, s.action, s.action_kind, s.days
  from public.stage_templates st
  cross join (values
    (1, 'pto',      'Подготовить акт-бегунок и приложить исполнительную схему', 'fill',    2),
    (2, 'foreman',  'Собрать подписи технадзора и руководителя технадзора',     'confirm', 3),
    (3, 'foreman',  'Собрать подписи первого и второго цеха',                    'confirm', 3),
    (4, 'pto',      'Положить подписанный комиссионный акт в папку ИД',          'attach',  1)
  ) as s(step_no, role_code, action, action_kind, days)
  where st.number = 39 and st.deleted_at is null
    and not exists (select 1 from public.stage_template_steps x where x.template_id = st.id and x.deleted_at is null);

  -- 2. Сотрудники: ФИО вместо «(тест)», ещё четыре человека без логина
  update public.profiles set full_name = 'Никитин Роман Андреевич' where full_name = 'Прораб (тест)';
  update public.profiles set full_name = 'Фомина Ольга Петровна'  where full_name = 'Снабжение (тест)';
  insert into public.profiles(full_name, role_code, phone)
  select v.n, v.r, v.ph from (values
    ('Сергеев Андрей Викторович', 'foreman', '+7 916 204-18-37'),
    ('Ковалёв Дмитрий Олегович',  'foreman', '+7 925 611-40-92'),
    ('Белова Ирина Сергеевна',    'pto',     '+7 903 778-25-14')
  ) as v(n, r, ph)
  where not exists (select 1 from public.profiles p where p.full_name = v.n and p.deleted_at is null);

  -- Прораб с логином — тот, под кем заходят «как прораб»; если логина у прораба нет — любой прораб
  select id into v_nikitin from public.profiles
  where role_code = 'foreman' and user_id is not null and deleted_at is null and is_active order by created_at limit 1;
  if v_nikitin is null then v_nikitin := pg_temp.person('Никитин Роман Андреевич', 'foreman'); end if;
  v_sergeev := pg_temp.person('Сергеев Андрей Викторович', 'foreman');
  v_kovalev := pg_temp.person('Ковалёв Дмитрий Олегович', 'foreman');
  v_galina  := pg_temp.person('Галина Ивановна', 'pto');
  v_belova  := pg_temp.person('Белова Ирина Сергеевна', 'pto');
  v_milana  := pg_temp.person('Милана', 'office');
  v_muslim  := pg_temp.person('Муслим', 'director');
  v_fomina  := pg_temp.person('Фомина Ольга Петровна', 'supply');
  -- Разные люди на разных ролях: если по роли нашёлся тот же человек, создаём отдельного
  if v_sergeev = v_nikitin then
    insert into public.profiles(full_name, role_code) values ('Сергеев Андрей Викторович', 'foreman') returning id into v_sergeev;
  end if;
  if v_kovalev in (v_nikitin, v_sergeev) then
    insert into public.profiles(full_name, role_code) values ('Ковалёв Дмитрий Олегович', 'foreman') returning id into v_kovalev;
  end if;
  if v_belova = v_galina then
    insert into public.profiles(full_name, role_code) values ('Белова Ирина Сергеевна', 'pto') returning id into v_belova;
  end if;

  -- 3. Заказчики
  update public.customers set name = 'ООО «Альфа-Девелопмент»' where name = 'Тестовый заказчик';
  insert into public.customers(name, inn, legal_address, comment)
  select v.n, v.inn, v.addr, v.cm from (values
    ('ООО «Северная девелоперская компания»', '7715004821', 'г. Москва, ул. Летчика Бабушкина, д. 1, офис 12', 'Коммерческий заказчик, ЖК «Северный парк»'),
    ('ООО «ПромТехСтрой»',                    '7722418390', 'г. Москва, Рязанский пр-т, д. 8А, стр. 3',       'Вынос сетей из пятна застройки')
  ) as v(n, inn, addr, cm)
  where not exists (select 1 from public.customers c where c.name = v.n and c.deleted_at is null);
  insert into public.customer_contacts(customer_id, full_name, position, phone, sort)
  select c.id, v.fn, v.pos, v.ph, 1 from public.customers c
  join (values
    ('ООО «Северная девелоперская компания»', 'Зайцева Марина Александровна', 'Руководитель проекта', '+7 495 120-44-08'),
    ('ООО «ПромТехСтрой»',                    'Лебедев Игорь Николаевич',     'Главный инженер',      '+7 495 987-31-20')
  ) as v(cn, fn, pos, ph) on v.cn = c.name
  where not exists (select 1 from public.customer_contacts cc where cc.customer_id = c.id and cc.deleted_at is null);

  select id into v_mosgaz from public.customers where name like 'АО%МОСГАЗ%' and deleted_at is null limit 1;
  select id into v_sever  from public.customers where name = 'ООО «Северная девелоперская компания»' limit 1;
  select id into v_prom   from public.customers where name = 'ООО «ПромТехСтрой»' limit 1;
  select id into v_alfa   from public.customers where name = 'ООО «Альфа-Девелопмент»' limit 1;

  -- 4. Объекты (create_object копирует этапы с условиями и сценариями, как из интерфейса)
  o1 := public.create_object(jsonb_build_object(
    'name', 'Газопровод среднего давления по ул. Профсоюзной, вл. 56', 'address', 'г. Москва, ул. Профсоюзная, вл. 56',
    'customer_id', v_mosgaz, 'object_type', 'uks', 'responsible_id', v_galina, 'status', 'in_work',
    'contract_start', v_today - 80, 'contract_end', v_today + 60,
    'notes', 'Ду 225 ПЭ, протяжённость 1,2 км, 2 врезки. Работы на проезжей части — ночью.'),
    array[v_nikitin, v_galina, v_milana, v_fomina, v_muslim],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  o2 := public.create_object(jsonb_build_object(
    'name', 'Перекладка газопровода низкого давления, Варшавское ш., д. 118', 'address', 'г. Москва, Варшавское ш., д. 118',
    'customer_id', v_mosgaz, 'object_type', 'uks', 'responsible_id', v_galina, 'status', 'in_work',
    'contract_start', v_today - 120, 'contract_end', v_today + 9,
    'notes', 'Сталь Ду 159, 640 м. Перекладка без отключения абонентов.'),
    array[v_nikitin, v_galina, v_milana, v_muslim],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  o3 := public.create_object(jsonb_build_object(
    'name', 'Газоснабжение ЖК «Северный парк», корпус 3', 'address', 'г. Москва, ул. Летчика Бабушкина, вл. 17, корп. 3',
    'customer_id', v_sever, 'object_type', 'urip', 'responsible_id', v_belova, 'status', 'in_work',
    'contract_start', v_today - 15, 'contract_end', v_today + 150,
    'notes', 'Ввод к котельной жилого корпуса, ПЭ Ду 110, 310 м.'),
    array[v_nikitin, v_belova, v_milana, v_fomina],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active
       and number not in (11, 12, 15, 16, 39, 40)));

  o4 := public.create_object(jsonb_build_object(
    'name', 'Вынос газопровода из пятна застройки, Рязанский пр-т, вл. 2', 'address', 'г. Москва, Рязанский пр-т, вл. 2',
    'customer_id', v_prom, 'object_type', 'urip', 'responsible_id', v_galina, 'status', 'in_work',
    'contract_start', v_today - 150, 'contract_end', v_today - 6,
    'notes', 'Срок договора прошёл: ждём допсоглашение о продлении на 30 дней.'),
    array[v_sergeev, v_galina, v_milana, v_muslim],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  o5 := public.create_object(jsonb_build_object(
    'name', 'Газопровод к котельной, Дмитровское ш., вл. 9', 'address', 'г. Москва, Дмитровское ш., вл. 9',
    'customer_id', v_alfa, 'object_type', 'urip', 'responsible_id', v_galina, 'status', 'planned',
    'contract_start', v_today + 10, 'contract_end', v_today + 200,
    'notes', 'Договор подписан, ждём ордер ОАТИ.'),
    array[v_nikitin, v_kovalev, v_galina, v_milana],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  o6 := public.create_object(jsonb_build_object(
    'name', 'Реконструкция газопровода, ул. Нагорная, д. 20', 'address', 'г. Москва, ул. Нагорная, д. 20',
    'customer_id', v_mosgaz, 'object_type', 'uks', 'responsible_id', v_galina, 'status', 'in_work',
    'contract_start', v_today - 260, 'contract_end', v_today - 40),
    array[v_nikitin, v_galina, v_milana, v_muslim],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  -- Создание объектов — задним числом, к началу договора
  -- (для планируемого объекта с будущим началом — вчера, чтобы история не уходила в будущее)
  update public.history h set created_at = least(pg_temp.at(o.contract_start - 3, 10), now() - interval '1 day')
  from public.objects o where h.object_id = o.id and h.entity_type = 'object' and o.id in (o1, o2, o3, o4, o5, o6);
  update public.objects set created_at = least(pg_temp.at(contract_start - 3, 10), now() - interval '1 day')
  where id in (o1, o2, o3, o4, o5, o6);

  -- 5. Ход этапов
  -- О1: середина работ — просрочка, «нет ответа», без исполнителя, вне очереди, на проверке
  perform pg_temp.close_range(o1, 1, 13, -78, 4, v_muslim);
  perform pg_temp.close_range(o1, 15, 17, -26, 4, v_muslim);
  perform pg_temp.stage(o1, 18, 'in_work',       -12, -3, p_note => 'Экскаватор на другом объекте, обещали вернуть в четверг');
  perform pg_temp.stage(o1, 19, 'in_work',        -6,  8);
  perform pg_temp.stage(o1, 20, 'sent',           -11,  6, p_sent_off => -9, p_resp_days => 5, p_note => 'Лаборатория не ответила, звонила 2 раза');
  perform pg_temp.stage(o1, 22, 'waiting_visit',   -4,  3, p_sent_off => -2);
  perform pg_temp.stage(o1, 24, 'in_work',         -2, 12, p_out_of_order => true, p_note => 'Начали адгезию на готовом участке, не дожидаясь изоляции по всей трассе');
  perform pg_temp.stage(o1, 14, 'on_review',      -10,  2);
  update public.object_stages set executor_id = null where id = pg_temp.sid(o1, 21);

  -- О2: финиш, срок договора через 9 дней — «горит», комиссионный акт по сценарию
  perform pg_temp.close_range(o2, 1, 33, -118, 3, v_muslim);
  perform pg_temp.stage(o2, 34, 'on_review',  -6, 1);
  perform pg_temp.stage(o2, 35, 'in_work',    -4, 1, p_remind => 3, p_note => 'АНПИ назначено на завтра, 9:00');
  perform pg_temp.stage(o2, 38, 'sent',       -3, 4, p_sent_off => -2, p_resp_days => 7);
  perform pg_temp.stage(o2, 39, 'in_work',    -2, 6);
  update public.object_stage_steps set state = 'done', done_by = v_galina, done_at = pg_temp.at(v_today - 1, 15),
         comment = 'Бегунок передан Никитину'
  where stage_id = pg_temp.sid(o2, 39) and step_no = 1;
  update public.object_stage_steps set state = 'current' where stage_id = pg_temp.sid(o2, 39) and step_no = 2;
  perform pg_temp.log(o2, 'stage', pg_temp.sid(o2, 39), 'step_done',
    'Этап 39: шаг 1 «Подготовить акт-бегунок и приложить исполнительную схему» выполнен', v_galina, pg_temp.at(v_today - 1, 15));

  -- О3: начало работ, сценарий «Согласование ЖКХ» на 2-м шаге
  perform pg_temp.close_range(o3, 1, 2, -14, 5, v_muslim);
  perform pg_temp.stage(o3, 3, 'in_work', -4, 10);
  perform pg_temp.stage(o3, 4, 'sent',    -3, 11, p_sent_off => -2, p_resp_days => 10);
  perform pg_temp.stage(o3, 7, 'in_work', -3, 11);
  update public.object_stage_steps set state = 'done', done_by = v_milana, done_at = pg_temp.at(v_today - 2, 12),
         comment = 'Адрес управы нашли в томе ПОС'
  where stage_id = pg_temp.sid(o3, 7) and step_no = 1;
  update public.object_stage_steps set state = 'current' where stage_id = pg_temp.sid(o3, 7) and step_no = 2;
  perform pg_temp.log(o3, 'stage', pg_temp.sid(o3, 7), 'step_done',
    'Этап 7: шаг 1 «Найти в документации данные и адрес, куда отправлять; подготовить заявку» выполнен', v_milana, pg_temp.at(v_today - 2, 12));
  perform public.stage_set_excluded(pg_temp.sid(o3, 44), true);

  -- О4: срок договора прошёл, хвосты по сдаче
  perform pg_temp.close_range(o4, 1, 40, -148, 3, v_muslim);
  perform pg_temp.stage(o4, 41, 'in_work', -18, -10, p_note => 'Эксплуатация переносит приёмку, ждём письмо');
  perform pg_temp.stage(o4, 42, 'sent',    -14,  -2, p_sent_off => -12, p_resp_days => 7);
  update public.object_stages set executor_id = null where id = pg_temp.sid(o4, 43);

  -- О6: завершён полностью и перенесён в архив
  perform pg_temp.close_range(o6, 1, 49, -255, 4, v_muslim);
  update public.objects set status = 'completed', completed_at = pg_temp.at(v_today - 42, 17) where id = o6;
  perform pg_temp.log(o6, 'object', o6, 'completed', 'Объект завершён и перенесён в архив', v_muslim, pg_temp.at(v_today - 42, 17));

  -- 6. Заявки: все виды и статусы; порядок вставки — по дате создания, номера идут по времени
  perform pg_temp.request(o6, 'Технадзор',      'done', 70, -66, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 2+40", "Длина, м": 240, "Количество стыков": 31}', 'ТН-2041/26');
  perform pg_temp.request(o6, 'Геотрест',       'done', 52, -48, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 4+10", "Длина, м": 410}', 'ГТ-17733');
  perform pg_temp.request(o4, 'Лаборатория МГ', 'done', 40, -36, v_sergeev, v_milana,
    '{"Пикеты (от – до)": "ПК 1+20 – ПК 3+00", "Количество стыков": 24, "Комментарий прораба": "Просвет стыков на участке под проезжей частью"}', 'ЛМГ-0912/26');
  perform pg_temp.request(o1, 'Технадзор',      'done', 34, -30, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 1+50", "Длина, м": 150, "Количество стыков": 18}', 'ТН-2188/26');
  perform pg_temp.request(o2, 'АНПИ',           'done', 30, -27, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 2+00 – ПК 4+40", "Длина, м": 240}', 'АНПИ-334');
  perform pg_temp.request(o1, 'Представители',  'done', 28, -25, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+80 – ПК 1+10", "Комментарий прораба": "Пересечение с кабелем 10 кВ, нужен представитель на шурфовку"}',
    'Акт допуска № 58', 'Россети', 14, 'Россети подтвердили выезд представителя');
  perform pg_temp.request(o2, 'ДИ',             'done', 24, -21, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 2+00", "Длина, м": 200}', 'ДИ-1187');
  perform pg_temp.request(o1, 'Лаборатория МГ', 'done', 20, -17, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 1+50 – ПК 3+20", "Количество стыков": 22}', 'ЛМГ-1043/26', null, 22);
  perform pg_temp.request(o4, 'Эксплуатация',   'sent', 16, -9, v_sergeev, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 5+20", "Комментарий прораба": "Приёмка в эксплуатацию, ковера и люки"}',
    null, null, 41, 'Эксплуатация просит перенести, ждём письменный ответ');
  perform pg_temp.request(o4, 'Геотрест',       'sent', 14, -6, v_sergeev, v_milana,
    '{"Пикеты (от – до)": "ПК 4+40 – ПК 5+20", "Длина, м": 80}', null, null, 42, 'Геотрест не отвечает, звонила дважды');
  perform pg_temp.request(o2, 'Геотрест',       'accepted', 12, -5, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 3+00 – ПК 6+40", "Длина, м": 340}', null, null, 42);
  perform pg_temp.request(o1, 'Интеграл',       'done', 11, -8, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 2+00 – ПК 2+60", "Количество стыков": 7}', 'ИНТ-5520');
  perform pg_temp.request(o1, 'Заказ снабжение','done', 10, -7, v_nikitin, v_fomina,
    '{"Что нужно (материал)": "Труба ПЭ 100 SDR 11 Ду 225", "Количество": "120 м", "Комментарий": "Доставка на площадку до 8:00"}',
    'Доставлено, накладная № 4471');
  perform pg_temp.request(o2, 'Технадзор',      'done', 9, -6, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 4+40 – ПК 6+40", "Длина, м": 200, "Количество стыков": 26}', 'ТН-2302/26');
  perform pg_temp.request(o4, 'Технадзор',      'ready', 9, -1, v_sergeev, v_milana,
    '{"Пикеты (от – до)": "ПК 4+80 – ПК 5+20", "Длина, м": 40}', null, null, null, 'Ждём подтверждения от технадзора');
  perform pg_temp.request(o1, 'ЭПИД',           'sent', 8, -3, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 3+20 – ПК 4+00", "Длина, м": 80}', null, null, null, 'ЭПИД перезвонят по дате выезда');
  perform pg_temp.request(o1, 'Технадзор',      'accepted', 7, 1, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 3+20 – ПК 4+60", "Длина, м": 140, "Количество стыков": 16, "Комментарий прораба": "Труба, изоляция, подсыпка"}',
    null, null, 25, 'Технадзор связался, они на связи');
  perform pg_temp.request(o3, 'Представители',  'accepted', 6, 2, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+40 – ПК 0+90", "Комментарий прораба": "Пересечение с водопроводом Ду 300"}',
    null, 'Водоканал', 14);
  perform pg_temp.request(o2, 'Эксплуатация',   'sent', 5, 2, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 6+40", "Комментарий прораба": "Сдача сооружений: ковера, люки, ЭХЗ"}', null, null, 36);
  perform pg_temp.request(o1, 'АНПИ',           'ready', 4, 3, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 1+50 – ПК 3+20", "Длина, м": 170}');
  perform pg_temp.request(o3, 'Заказ снабжение','ready', 4, 2, v_nikitin, v_fomina,
    '{"Что нужно (материал)": "Футляр ПЭ Ду 225, отводы 90° Ду 110", "Количество": "12 м, 4 шт.", "Комментарий": "Под переход через дорогу"}');
  perform pg_temp.request(o2, 'Лаборатория МГ', 'ready', 3, 1, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 5+00 – ПК 6+40", "Количество стыков": 15}', null, null, 34);
  perform pg_temp.request(o3, 'Геотрест',       'sent', 3, 4, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 3+10", "Длина, м": 310}', null, null, 13);
  perform pg_temp.request(o1, 'Представители',  'new', 1, 4, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 4+60 – ПК 5+10", "Комментарий прораба": "Тепловая сеть в зоне траншеи"}', null, 'Теплосети');
  perform pg_temp.request(o1, 'Лаборатория МГ', 'new', 0, 3, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 3+20 – ПК 4+60", "Количество стыков": 16, "Комментарий прораба": "Просвет 100% на проезжей части"}', null, null, 22);
  perform pg_temp.request(o2, 'ДИ',             'new', 0, 2, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 4+00 – ПК 6+40", "Длина, м": 240}');
  perform pg_temp.request(o3, 'Технадзор',      'new', 0, 5, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 1+20", "Длина, м": 120, "Комментарий прораба": "Первый выход технадзора на объект"}');
  perform pg_temp.request(o5, 'Заказ снабжение','new', 0, 12, v_kovalev, v_fomina,
    '{"Что нужно (материал)": "Труба ПЭ 100 SDR 11 Ду 160", "Количество": "450 м", "Комментарий": "Под старт работ по договору"}');
end $$;

-- Проверка: объектов 6, заявок не меньше 28; новых, просроченных и исполненных — больше нуля
select
  (select count(*) from public.objects where created_at > now() - interval '400 days'
     and name in ('Газопровод среднего давления по ул. Профсоюзной, вл. 56',
                  'Перекладка газопровода низкого давления, Варшавское ш., д. 118',
                  'Газоснабжение ЖК «Северный парк», корпус 3',
                  'Вынос газопровода из пятна застройки, Рязанский пр-т, вл. 2',
                  'Газопровод к котельной, Дмитровское ш., вл. 9',
                  'Реконструкция газопровода, ул. Нагорная, д. 20')) as objects,
  (select count(*) from public.v_requests) as requests,
  (select count(*) from public.v_requests where is_new) as requests_new,
  (select count(*) from public.v_requests where is_overdue) as requests_overdue,
  (select count(*) from public.v_requests where status = 'done') as requests_done,
  (select count(*) from public.v_object_stages where is_overdue and not is_excluded) as stages_overdue;
