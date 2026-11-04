-- =====================================================================
-- ООО «Лидер» · Версия 1 · Демо-данные для видеообзора (ТЗ раздел 9)
-- ПЕРЕД ЗАПУСКОМ: через интерфейс создать объект «ТЕСТ · УКС …» со всеми этапами
-- и участниками «Прораб (тест)», «Галина Ивановна», «Милана».
-- Скрипт приводит его в «живой» вид: этапы в разных статусах, один просроченный,
-- один «нет ответа», один без исполнителя; заявки во всех пяти статусах,
-- одна просроченная, одна новая. Запускать один раз.
-- Статусы ставятся напрямую (служебный режим lider.rpc), т. к. в SQL Editor
-- нет авторизованного пользователя для RPC.
-- =====================================================================

do $$
declare
  v_obj      uuid;
  v_foreman  uuid := (select id from public.profiles where full_name = 'Прораб (тест)' and deleted_at is null limit 1);
  v_pto      uuid := (select id from public.profiles where role_code = 'pto' and deleted_at is null order by created_at limit 1);
  v_office   uuid := (select id from public.profiles where role_code = 'office' and deleted_at is null order by created_at limit 1);
  v_director uuid := (select id from public.profiles where role_code = 'director' and deleted_at is null order by created_at limit 1);
  v_today    date := public.msk_today();
  v_type     uuid;
  v_req      uuid;
  v_pikety   uuid;
  r record;
begin
  select id into v_obj from public.objects
  where name ilike 'ТЕСТ%УКС%' and deleted_at is null order by created_at limit 1;
  -- Скрипт рассчитан на объект, созданный вручную через UI.
  -- При supabase db reset объекта ещё нет — пропускаем; демо создаёт 04_demo_data.sql.
  if v_obj is null then
    raise notice '03_demo_data: объект «ТЕСТ · УКС …» не найден — пропуск (демо в 04_demo_data.sql)';
    return;
  end if;

  perform set_config('lider.rpc', 'on', true);

  -- Исполнители: прораб на всех этапах, этап 8 — без исполнителя
  update public.object_stages set executor_id = v_foreman, confirmer_id = v_director
  where object_id = v_obj and deleted_at is null and number <> 8;
  update public.object_stages set executor_id = null where object_id = v_obj and number = 8;
  -- Документальные этапы — инженеру ПТО
  update public.object_stages set executor_id = v_pto
  where object_id = v_obj and number in (3, 4, 5, 6, 7, 9, 10, 11);

  -- Этапы 1–2 закрыты: условия выполнены
  update public.object_stage_conditions set is_done = true, done_by = v_foreman, done_at = now()
  where stage_id in (select id from public.object_stages where object_id = v_obj and number in (1, 2, 6));
  update public.object_stages set status_code = 'closed', start_date = v_today - 40, due_date = v_today - 30,
         closed_at = now() - interval '30 days', closed_by = v_director
  where object_id = v_obj and number in (1, 2);

  -- Этап 3 — просрочен (в работе, срок прошёл 5 дней назад)
  update public.object_stages set status_code = 'in_work', start_date = v_today - 20, due_date = v_today - 5,
         note = 'Ждём замечания экспертизы, обещали в понедельник'
  where object_id = v_obj and number = 3;

  -- Этап 4 — «нет ответа»: документ отправлен 10 дней назад, ответ ждали 5 дней
  update public.object_stages set status_code = 'sent', start_date = v_today - 12, due_date = v_today + 10,
         doc_sent_at = v_today - 10, response_days = 5
  where object_id = v_obj and number = 4;

  -- Этап 5 — «горит»: срок через 2 дня, напомнить за 3
  update public.object_stages set status_code = 'on_approval', start_date = v_today - 7, due_date = v_today + 2, remind_days = 3
  where object_id = v_obj and number = 5;

  -- Этап 6 — на проверке (условия выполнены)
  update public.object_stages set status_code = 'on_review', start_date = v_today - 8, due_date = v_today + 5
  where object_id = v_obj and number = 6;

  -- Этап 7 — в работе по сценарию «Согласование ЖКХ»: первый шаг выполнен, текущий — второй
  update public.object_stages set status_code = 'in_work', start_date = v_today - 3, due_date = v_today + 14
  where object_id = v_obj and number = 7;
  update public.object_stage_steps set state = 'done', done_by = v_office, done_at = now() - interval '2 days',
         comment = 'Адрес ЖКХ нашли в томе ПОС'
  where stage_id = (select id from public.object_stages where object_id = v_obj and number = 7) and step_no = 1;
  update public.object_stage_steps set state = 'current'
  where stage_id = (select id from public.object_stages where object_id = v_obj and number = 7) and step_no = 2;

  -- Этап 9 — ожидание выезда
  update public.object_stages set status_code = 'waiting_visit', start_date = v_today - 2, due_date = v_today + 7
  where object_id = v_obj and number = 9;

  -- Этап 13 — взят вне очереди (для значка), этап 14 — в работе
  update public.object_stages set status_code = 'in_work', start_date = v_today - 1, due_date = v_today + 10, out_of_order = true
  where object_id = v_obj and number = 13;

  perform public.log_history(v_obj, 'object', v_obj, 'demo', 'Загружены демо-данные для видеообзора');

  -- ---------- Заявки: все пять статусов, одна просроченная, одна новая ----------
  select id into v_type from public.request_types where name = 'Технадзор' and deleted_at is null limit 1;
  select id into v_pikety from public.request_type_fields where request_type_id = v_type and label like 'Пикеты%' limit 1;

  for r in
    select * from (values
      ('new',      v_today + 3,  'ПК 1+00 – ПК 2+50', null::text),
      ('ready',    v_today + 2,  'ПК 2+50 – ПК 3+10', null),
      ('sent',     v_today + 1,  'ПК 3+10 – ПК 4+00', null),
      ('accepted', v_today,      'ПК 4+00 – ПК 4+80', null),
      ('done',     v_today - 6,  'ПК 0+00 – ПК 1+00', 'Протокол № 117-ТН'),
      ('sent',     v_today - 4,  'ПК 5+00 – ПК 5+60', null)   -- просроченная
    ) as t(status, call_date, pikety, result)
  loop
    insert into public.requests(object_id, request_type_id, type_name, initiator_id, office_id, call_date, status,
                                sent_at, accepted_at, done_at, done_by, result_text, created_at)
    values (v_obj, v_type, 'Технадзор', v_foreman,
            case when r.status <> 'new' then v_office end,
            r.call_date, r.status,
            case when r.status in ('sent', 'accepted', 'done') then now() - interval '3 days' end,
            case when r.status in ('accepted', 'done') then now() - interval '2 days' end,
            case when r.status = 'done' then now() - interval '1 day' end,
            case when r.status = 'done' then v_office end,
            r.result,
            now() - interval '5 days')
    returning id into v_req;

    if v_pikety is not null then
      insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by)
      values (v_req, v_pikety, 'Пикеты (от – до)', 'text', to_jsonb(r.pikety), v_foreman);
    end if;
    if r.result is not null then
      insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by)
      select v_req, f.id, f.label, f.field_type, to_jsonb(r.result), v_office
      from public.request_type_fields f where f.request_type_id = v_type and f.label = 'Номер протокола';
    end if;
  end loop;

  insert into public.request_comments(request_id, author_id, text)
  select id, v_office, 'Технадзор связался, они на связи' from public.requests
  where object_id = v_obj and status = 'sent' order by call_date desc limit 1;
end $$;

-- Проверка: ожидаем по одному этапу просроченному, без ответа, без исполнителя и 6 заявок
select
  (select count(*) from public.v_object_stages v join public.objects o on o.id = v.object_id
    where o.name ilike 'ТЕСТ%УКС%' and v.is_overdue) as stages_overdue,
  (select count(*) from public.v_object_stages v join public.objects o on o.id = v.object_id
    where o.name ilike 'ТЕСТ%УКС%' and v.is_no_response) as stages_no_response,
  (select count(*) from public.v_object_stages v join public.objects o on o.id = v.object_id
    where o.name ilike 'ТЕСТ%УКС%' and v.is_no_executor) as stages_no_executor,
  (select count(*) from public.requests rq join public.objects o on o.id = rq.object_id
    where o.name ilike 'ТЕСТ%УКС%') as requests;
