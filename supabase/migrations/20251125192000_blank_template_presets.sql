-- Заполнить config шаблонов бланков официальными полями (как в генераторах).
-- Пустые tableRows/excelColumns больше не оставляем — конструктор и live совпадают.

update public.request_blank_templates
set config = jsonb_build_object(
  'format', 'word_table',
  'letterhead', true,
  'recipientLines', jsonb_build_array('В лабораторию ООО «Интеграл»'),
  'showDirectorBlock', true,
  'tableRows', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Заказчик', 'sourceKind', 'constant', 'sourceValue', 'ООО «ЛИДЕР»'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Метод контроля качества', 'sourceKind', 'field', 'sourceValue', 'Метод контроля'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Дата и время проведения работ', 'sourceKind', 'object', 'sourceValue', 'Дата и время вызова'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Нормы, по которым необходимо производить контроль', 'sourceKind', 'field', 'sourceValue', 'Нормы контроля'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Условия выполнения контроля', 'sourceKind', 'field', 'sourceValue', 'Условия / виды работ'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Объект', 'sourceKind', 'object', 'sourceValue', 'Название объекта'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Номер и дата регистрации проекта в Управлении технического надзора', 'sourceKind', 'object', 'sourceValue', 'Регистрация проекта в УТН'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Точный фактический адрес контроля', 'sourceKind', 'object', 'sourceValue', 'Адрес объекта'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Типоразмер и свойства контролируемых «изделий и/или элементов» и их точное количество в зависимости от метода контроля (диаметр, толщина, длина, пикеты, давление и др.)', 'sourceKind', 'object', 'sourceValue', 'Типоразмер и пикеты'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'ФИО и контактные телефоны представителей заказчика на объекте', 'sourceKind', 'field', 'sourceValue', 'Ответственный за производство работ')
  ),
  'faxTitle', '',
  'faxBody', '',
  'excelColumns', '[]'::jsonb,
  'messageTemplate', ''
),
updated_at = now()
where name = 'Лаборатория Интеграл' and deleted_at is null;

update public.request_blank_templates
set config = jsonb_build_object(
  'format', 'word_table',
  'letterhead', true,
  'recipientLines', jsonb_build_array('В лабораторию технического надзора АО «МОСГАЗ»'),
  'showDirectorBlock', true,
  'tableRows', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Заказчик', 'sourceKind', 'constant', 'sourceValue', 'ООО «ЛИДЕР»'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Метод контроля качества', 'sourceKind', 'field', 'sourceValue', 'Метод контроля'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Дата и время проведения работ', 'sourceKind', 'object', 'sourceValue', 'Дата и время вызова'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Нормы, по которым необходимо производить контроль', 'sourceKind', 'field', 'sourceValue', 'Нормы контроля'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Условия выполнения контроля', 'sourceKind', 'field', 'sourceValue', 'Условия / виды работ'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Объект', 'sourceKind', 'object', 'sourceValue', 'Название объекта'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Номер и дата регистрации проекта в Управлении технического надзора', 'sourceKind', 'object', 'sourceValue', 'Регистрация проекта в УТН'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Точный фактический адрес контроля', 'sourceKind', 'object', 'sourceValue', 'Адрес объекта'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Типоразмер и свойства контролируемых «изделий и/или элементов» и их точное количество в зависимости от метода контроля (диаметр, толщина, длина, пикеты, давление и др.)', 'sourceKind', 'object', 'sourceValue', 'Типоразмер и пикеты'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'ФИО и контактные телефоны представителей заказчика на объекте', 'sourceKind', 'field', 'sourceValue', 'Ответственный за производство работ')
  ),
  'faxTitle', '',
  'faxBody', '',
  'excelColumns', '[]'::jsonb,
  'messageTemplate', ''
),
updated_at = now()
where name = 'Лаборатория МГ — таблица' and deleted_at is null;

update public.request_blank_templates
set config = jsonb_build_object(
  'format', 'excel',
  'letterhead', false,
  'recipientLines', '[]'::jsonb,
  'showDirectorBlock', false,
  'tableRows', '[]'::jsonb,
  'faxTitle', '',
  'faxBody', '',
  'excelColumns', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Время вызова', 'sourceKind', 'object', 'sourceValue', 'Дата и время вызова'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Инспектор', 'sourceKind', 'object', 'sourceValue', 'Инспектор технадзора'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Заказчик', 'sourceKind', 'object', 'sourceValue', 'Заказчик'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Строительная организация', 'sourceKind', 'constant', 'sourceValue', '"ЛИДЕР" ООО'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Ответственный за производство работ', 'sourceKind', 'field', 'sourceValue', 'Ответственный за производство работ'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Адрес объекта', 'sourceKind', 'object', 'sourceValue', 'Адрес объекта'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Виды работ', 'sourceKind', 'field', 'sourceValue', 'Виды работ'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', '№ проекта', 'sourceKind', 'object', 'sourceValue', 'Шифр / номер проекта'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Регистрация УТН №', 'sourceKind', 'object', 'sourceValue', 'Номер УТН'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Регистрация УТН дата', 'sourceKind', 'object', 'sourceValue', 'Дата УТН'),
    jsonb_build_object('id', gen_random_uuid()::text, 'title', 'Примечание', 'sourceKind', 'field', 'sourceValue', 'Примечание')
  ),
  'messageTemplate', ''
),
updated_at = now()
where name = 'Технадзор (Excel)' and deleted_at is null;

update public.request_blank_templates
set config = jsonb_build_object(
  'format', 'message',
  'letterhead', false,
  'recipientLines', '[]'::jsonb,
  'showDirectorBlock', false,
  'tableRows', '[]'::jsonb,
  'faxTitle', '',
  'faxBody', '',
  'excelColumns', '[]'::jsonb,
  'messageTemplate', E'1. Дата, на которую нужно вызвать (направлять за 2 дня до вызова): {{Строка вызова Геотрест}}\n2. Шифр и полное наименование объекта: {{Шифр и наименование объекта}}\n3. Коммуникация и объем (который нужно отснять): {{Коммуникация и объём}}\n4. Точный адрес для вызова: {{Точный адрес для вызова}}\n5. Ответственный на объекте и его номер: {{Ответственный на объекте}}'
),
updated_at = now()
where name = 'Геотрест — сообщение' and deleted_at is null;

update public.request_blank_templates
set config = jsonb_build_object(
  'format', 'word_fax',
  'letterhead', true,
  'recipientLines', jsonb_build_array(
    'Начальнику Управления',
    'ЭГНД АО «МОСГАЗ»',
    'Е.А. Визгаловой'
  ),
  'showDirectorBlock', true,
  'tableRows', '[]'::jsonb,
  'faxTitle', 'ФАКСОГРАММА',
  'faxBody', E'Просим направить представителя лаборатории для контроля качества сварных стыков.\n\nОбъект: {{Название объекта}}\nШифр / № проекта: {{Шифр / номер проекта}}\nВиды работ: {{Виды работ}}\nПикеты: {{Пикеты (от – до)}}\nДата и время: {{Дата и время вызова}}\nАдрес: {{Адрес объекта}}\nОтветственный: {{Ответственный за производство работ}}\nПримечание: {{Примечание}}',
  'excelColumns', '[]'::jsonb,
  'messageTemplate', ''
),
updated_at = now()
where name = 'Лаборатория МГ — факс' and deleted_at is null;
