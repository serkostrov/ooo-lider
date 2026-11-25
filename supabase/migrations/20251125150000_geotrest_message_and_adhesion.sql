-- Геотрест: копируемое сообщение в Max (geotrest_message).
-- Адгезия: новый вид + бланк Интеграл (lab_integral_docx).
-- Лаборатория МГ: табличный бланк просвета (lab_mosgaz_table_docx), факс УЭГНД остаётся как lab_mosgaz_docx.

-- ---------------------------------------------------------------------------
-- Геотрест
-- ---------------------------------------------------------------------------
update public.request_types
set
  doc_template = 'geotrest_message',
  send_by_email = false
where name = 'Геотрест'
  and deleted_at is null;

do $$
declare
  tid uuid;
begin
  select id into tid from public.request_types
  where name = 'Геотрест' and deleted_at is null
  limit 1;
  if tid is null then return; end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Вид вызова' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (tid, 'Вид вызова', 'text', true, 'initiator', 20, '"КГС"'::jsonb);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Коммуникация и объём' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort
    )
    values (tid, 'Коммуникация и объём', 'textarea', true, 'initiator', 21);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Точный адрес для вызова' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort
    )
    values (tid, 'Точный адрес для вызова', 'text', false, 'initiator', 22);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Ответственный на объекте' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (
      tid,
      'Ответственный на объекте',
      'text',
      true,
      'initiator',
      23,
      '"Балаев Юнус +7-999-999-00-65"'::jsonb
    );
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Шифр и наименование объекта' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort
    )
    values (tid, 'Шифр и наименование объекта', 'textarea', false, 'office', 24);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Адгезия (новый вид заявки → бланк Интеграл)
-- ---------------------------------------------------------------------------
do $$
declare
  tid uuid;
  base_sort int;
begin
  select coalesce(max(sort), 0) + 1 into base_sort
  from public.request_types where deleted_at is null;

  select id into tid from public.request_types
  where name = 'Адгезия' and deleted_at is null
  limit 1;

  if tid is null then
    insert into public.request_types(name, sort, uses_representatives, doc_template, send_by_email)
    values ('Адгезия', base_sort, false, 'lab_integral_docx', true)
    returning id into tid;
  else
    update public.request_types
    set doc_template = coalesce(nullif(doc_template, ''), 'lab_integral_docx')
    where id = tid;
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Пикеты (от – до)' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values
      (tid, 'Пикеты (от – до)',       'text',   false, 'initiator', 1),
      (tid, 'Длина, м',               'number', false, 'initiator', 2),
      (tid, 'Количество стыков',      'number', false, 'initiator', 3),
      (tid, 'Комментарий прораба',    'text',   false, 'initiator', 4),
      (tid, 'Фото / документы',       'file',   false, 'initiator', 5),
      (tid, 'Адрес отправки (email)', 'text',   false, 'office',    6),
      (tid, 'Номер протокола',        'text',   false, 'office',    7);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Время вызова' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Время вызова', 'time', true, 'initiator', 8);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Метод контроля' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (tid, 'Метод контроля', 'text', true, 'initiator', 9, '"АДГЕЗИЯ"'::jsonb);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Нормы контроля' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (
      tid,
      'Нормы контроля',
      'textarea',
      false,
      'initiator',
      10,
      to_jsonb('СП 42 102 2004, СП 62.13330.2011 (СНиП 42-01-2002) и ГОСТ 9.602-05'::text)
    );
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Условия / виды работ' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (
      tid,
      'Условия / виды работ',
      'textarea',
      false,
      'initiator',
      11,
      to_jsonb('Адгезия стыков'::text)
    );
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Типоразмер и пикеты' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Типоразмер и пикеты', 'textarea', true, 'initiator', 12);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Ответственный за производство работ' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (
      tid,
      'Ответственный за производство работ',
      'text',
      true,
      'initiator',
      13,
      '"Балаев Юнус +7-999-999-00-65"'::jsonb
    );
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Примечание' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Примечание', 'textarea', false, 'initiator', 14);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Исх. №' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Исх. №', 'text', false, 'office', 15);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid
      and label = 'Номер и дата регистрации проекта в УТН'
      and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Номер и дата регистрации проекта в УТН', 'text', false, 'office', 16);
  end if;

  if not exists (
    select 1 from public.request_type_scenario_steps
    where request_type_id = tid
  ) then
    insert into public.request_type_scenario_steps(request_type_id, step_no, role_code, to_status, sort)
    select tid, s.step_no, s.role_code, s.to_status, s.sort
    from public.request_types t
    join public.request_type_scenario_steps s on s.request_type_id = t.id
    where t.name = 'Интеграл' and t.deleted_at is null
    order by s.sort;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Лаборатория МГ → табличный бланк (как «просвет стыков мосгаз.docx»)
-- ---------------------------------------------------------------------------
update public.request_types
set doc_template = 'lab_mosgaz_table_docx'
where name = 'Лаборатория МГ'
  and deleted_at is null
  and (doc_template is null or doc_template in ('', 'lab_mosgaz_docx'));

do $$
declare
  tid uuid;
begin
  select id into tid from public.request_types
  where name = 'Лаборатория МГ' and deleted_at is null
  limit 1;
  if tid is null then return; end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Метод контроля' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (tid, 'Метод контроля', 'text', true, 'initiator', 30, '"Ультразвуковой / Радиографический"'::jsonb);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Нормы контроля' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (
      tid,
      'Нормы контроля',
      'textarea',
      false,
      'initiator',
      31,
      to_jsonb('СП 42-102-2004, СП 62.13330.2011 (СНиП 42-001-06), РД 01-001-06 и СП 42-103-2004'::text)
    );
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Условия / виды работ' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (
      tid,
      'Условия / виды работ',
      'textarea',
      true,
      'initiator',
      32,
      to_jsonb('Просим Вас произвести просвет стыков с получением результатов на месте'::text)
    );
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Типоразмер и пикеты' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Типоразмер и пикеты', 'textarea', false, 'initiator', 33);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid
      and label = 'Номер и дата регистрации проекта в УТН'
      and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Номер и дата регистрации проекта в УТН', 'text', false, 'office', 34);
  end if;

  -- «Виды работ» больше не обязательны (остались для старых заявок / факса)
  update public.request_type_fields
  set is_required = false
  where request_type_id = tid and label = 'Виды работ' and deleted_at is null;
end $$;
