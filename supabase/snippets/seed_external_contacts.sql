-- Сид внешних контактов (из АДРЕСА.xlsx) для локалки и прода.
-- Идемпотентно: повторный запуск не плодит дубли (по lower(full_name)).
-- Что делает:
--   1) заказчики Мосгаз / Интеграл / Россети / Мосводоканал (если ещё нет)
--   2) external_contacts с kind + привязкой к заказчику
--   3) людей с customer_id копирует в customer_contacts (Специалисты)
--
-- В Excel слева люди, справа организации — два списка.
-- customer_key: по названию/должности/примечанию ИЛИ по домену почты
--   (@mos-gaz.ru → mosgaz, integral → integral, rosset → rosseti, mosvodokanal → vodokanal).
--
-- Запуск (prod):
--   psql "$DATABASE_URL" -f supabase/snippets/seed_external_contacts.sql
-- или SQL Editor в Supabase Dashboard → вставить файл → Run.
--
-- Источник данных: supabase/snippets/external_contacts_from_addresses.json

begin;

-- --- заказчики ---
insert into public.customers(name, comment)
select v.name, v.comment
from (values
  ('АО «МОСГАЗ»', 'Сид из внешних контактов (АДРЕСА)'),
  ('ООО «Интеграл»', 'Сид из внешних контактов (АДРЕСА)'),
  ('ПАО «Россети»', 'Сид из внешних контактов (АДРЕСА)'),
  ('АО «Мосводоканал»', 'Сид из внешних контактов (АДРЕСА)')
) as v(name, comment)
where not exists (
  select 1 from public.customers c
  where c.deleted_at is null
    and (
      (v.name ilike '%МОСГАЗ%' and c.name ilike '%МОСГАЗ%')
      or (v.name ilike '%Интеграл%' and c.name ilike '%Интеграл%')
      or (v.name ilike '%Россет%' and c.name ilike '%Россет%')
      or (v.name ilike '%Мосводоканал%' and c.name ilike '%Мосводоканал%')
    )
);

create temporary table _seed_ext_contacts (
  sort int not null,
  kind text not null,
  full_name text not null,
  position text,
  phone text,
  email text,
  comment text,
  customer_key text
) on commit drop;

insert into _seed_ext_contacts(sort, kind, full_name, position, phone, email, comment, customer_key) values
  (1, 'person', 'Вдовин Михаил Иванович', 'Генеральный директор Мосгаз', null, null, null, 'mosgaz'),
  (2, 'person', 'Свиридова Елена Владимировна', 'Главному инженеру проекта Мастерской №2 УРПСД Мосгаз', '8(495)660-27-60 (42-43)', null, null, 'mosgaz'),
  (3, 'person', 'Скорикова Ольга Анатольевна', 'Начальник УКС Мосгаз', null, null, null, 'mosgaz'),
  (4, 'person', 'Сафронов Станислав Александрович', 'Куратор объекта "Бараново" Мосгаз', '8(926)396-03-99', 'safronovsa@mos-gaz.ru', null, 'mosgaz'),
  (5, 'person', 'Чистова Кабанова Анастасия', 'Секретарь УКС Мосгаз', '8(495)660-60-83 (20-13)', 's205@mos-gaz.ru', null, 'mosgaz'),
  (6, 'person', 'Торопцев', 'Начальниик УРИП Мосгаз', null, 'toroptcevas@mos-gaz.ru', null, 'mosgaz'),
  (7, 'person', 'Ольга Мудрая Викторовна', 'Секретарь УРИП Мосгаз', null, 'MudrayaOV@mos-gaz.ru', null, 'mosgaz'),
  (8, 'person', 'Хмелева Наталья Владимировна', 'ПТО УКС Мосгаз', '8(495)287-79-83 (22-14)', null, 'запрос РД', 'mosgaz'),
  (9, 'person', 'Ермачкова Татьяна', 'Ведущий инженер ОПП УКС Мосгаз', '8(985)443-43-38 8(495)660-29-77 (52-69)', 'ermachkovatg@mos-gaz.ru', 'ордер', 'mosgaz'),
  (10, 'person', 'Чинаев', 'инспектор по защите Мосгаз', null, 'chinaevum@mos-gaz.ru', null, 'mosgaz'),
  (11, 'person', 'Созанская Елена', 'Зам. Начальник УКС Мосгаз', '8(926)382-96-16 (22-47)', 'sozanskayea@mos-gaz.ru', 'ордер', 'mosgaz'),
  (12, 'person', 'Кабанова Наталья Юрьевна', 'Инженер ПТО УТН Мосгаз', '8(495)287-79-87 (20-53)', 'kabanovanu@mos-gaz.ru', null, 'mosgaz'),
  (13, 'person', 'Еремина Виктория Олеговна', 'Начальник УТН', null, null, null, null),
  (14, 'person', 'Ракова Екатерина Сергеевна', null, null, 'rakovaes@mos-gaz.ru', null, 'mosgaz'),
  (15, 'person', 'Гусарова Олеся Викторовна', null, '8(495)287-96-44', null, 'рег. проекта РД Мосгаз технадзор', 'mosgaz'),
  (16, 'person', 'Титова Наталья Владимировна', null, '8(499)267-90-16', null, null, null),
  (17, 'person', 'Семченко Наталья Вячеславна', 'Зам. Начальник управления Мосгаз', '8(499)263-07-58', null, 'технадзор', 'mosgaz'),
  (18, 'person', 'Глаголева Нина Михайловна', 'Ведущий инженер ОПП УКС Мосгаз', '8(925)328-08-41 8(495)916-59-00 (24-37)', null, 'порубочный талон', 'mosgaz'),
  (19, 'person', 'Самсонова Оксана Сергеевна', 'Зам. Начальник лаборатории мех. Испытания', '8(499)218-13-58', null, null, null),
  (20, 'person', 'Татьяна', null, '8(910)674-41-89', null, 'спец. Сафронов', null),
  (21, 'person', 'Нестерова Елизавета', 'ИК ТЭС ПТО', '8(999)772-91-60', 'e.nesterovovich@iktes.ru', null, null),
  (22, 'person', 'Елена Гончарова', 'ИК ТЭС', '8(925)022-96-61', 'e.goncharova@iktes.ru', null, null),
  (23, 'person', 'Борсунов Алексей Анатольевич', 'Начальник Лаборатории мех. Испытаний', '8(499)213-13-68 8(916)792-18-57', null, null, null),
  (24, 'person', 'Андреев Максим Юрьевич', 'Технадзор спец. ГСН', '8(985)894-62-64', null, null, null),
  (25, 'person', 'Васильев Константин Евгеньевич', 'Технадзорспец. АЗ', '8(916)996-92-93', null, null, null),
  (26, 'person', 'Гавриков Роман Андреевич', 'Геодезист ООО "ЛИДЕР"', '8(910)425-33-00', 'Roman-type-r@yandex.ru', null, null),
  (27, 'person', 'Спицина Анна Анатольевна', 'ПТО Мастер Участка Мосгаз', '8(926)258-39-95', 'SpicynaAA@mos-gaz.ru', 'увед. ГВСД и УЭГНД', 'mosgaz'),
  (28, 'person', 'Александр', 'ИНТЕГРАЛ Заявки', '8(915)119-07-07', null, null, 'integral'),
  (29, 'org', 'АО "МОСГАЗ"', null, '8(800)700-71-04', 'info@mos-gaz.ru', null, 'mosgaz'),
  (30, 'org', 'ОДНО ОКНО АО "МОСГАЗ"', null, '8(495)660-72-66', 'coo@mos-gaz.ru', null, 'mosgaz'),
  (31, 'org', 'Лаб. Мосгаз', null, '8(499)267-62-89 8(499)263-11-00', 'platovdv@mos-gaz.ru', null, 'mosgaz'),
  (32, 'org', 'Лаб. Интеграл', null, '8(495)987-18-00 8(499)263-11-00', 'integral22@list.ru', null, 'integral'),
  (33, 'service', 'Технадзор', null, null, 'tehnadxor@mos-gaz.ru', null, 'mosgaz'),
  (34, 'org', 'Жилищник', null, '8(499)652-65-33', 'ptin-zhilfilimonky@mos-gaz.ru', null, 'mosgaz'),
  (35, 'org', 'Префектура', null, null, 'tinao@mos.ru', null, null),
  (36, 'service', 'Регистрация Журналов', null, null, null, '2 эт. Мосгаз 211 каб. УКС', 'mosgaz'),
  (37, 'org', 'Департамент природопользования', null, null, 'depmospriroda@mos.ru', null, null),
  (38, 'service', 'Снабжение', null, null, 'Zaletovmv@mos-gaz.ru; daevaaa@mos-gaz.ru; teplovodskayain@mos-gaz.ru; kulikovsv@mos-gaz.ru', null, 'mosgaz'),
  (39, 'org', 'РОССЕТИ', null, null, null, 'lk.rossetmr.ru', 'rosseti'),
  (40, 'org', 'МОСВОДОКАНАЛ', null, null, null, 'ep.mosvodokanal.ru', 'vodokanal'),
  (41, 'org', 'ГВСД  ГРС УЭНГД', null, null, 'info@mos-gaz.ru; chinaevum@mos-gaz.ru; tehnadzor@mos-gaz.ru', 'мосгаз,инспектор по защите,технадзор', 'mosgaz');

-- вставка только новых
insert into public.external_contacts(kind, full_name, position, phone, email, comment, is_active, sort, customer_id)
select
  s.kind,
  s.full_name,
  s.position,
  s.phone,
  s.email,
  s.comment,
  true,
  coalesce((select max(e.sort) from public.external_contacts e where e.deleted_at is null), 0) + s.sort,
  case s.customer_key
    when 'mosgaz' then (select id from public.customers where deleted_at is null and name ilike '%МОСГАЗ%' order by created_at limit 1)
    when 'integral' then (select id from public.customers where deleted_at is null and name ilike '%Интеграл%' order by created_at limit 1)
    when 'rosseti' then (select id from public.customers where deleted_at is null and name ilike '%Россет%' order by created_at limit 1)
    when 'vodokanal' then (select id from public.customers where deleted_at is null and name ilike '%Мосводоканал%' order by created_at limit 1)
    else null
  end
from _seed_ext_contacts s
where not exists (
  select 1 from public.external_contacts e
  where e.deleted_at is null
    and lower(trim(e.full_name)) = lower(trim(s.full_name))
);

-- обновить уже существующие (в т.ч. восстановить customer_id по ключу)
update public.external_contacts e
set
  kind = s.kind,
  position = s.position,
  phone = s.phone,
  email = s.email,
  comment = s.comment,
  customer_id = coalesce(
    case s.customer_key
      when 'mosgaz' then (select id from public.customers where deleted_at is null and name ilike '%МОСГАЗ%' order by created_at limit 1)
      when 'integral' then (select id from public.customers where deleted_at is null and name ilike '%Интеграл%' order by created_at limit 1)
      when 'rosseti' then (select id from public.customers where deleted_at is null and name ilike '%Россет%' order by created_at limit 1)
      when 'vodokanal' then (select id from public.customers where deleted_at is null and name ilike '%Мосводоканал%' order by created_at limit 1)
      else null
    end,
    e.customer_id
  )
from _seed_ext_contacts s
where e.deleted_at is null
  and lower(trim(e.full_name)) = lower(trim(s.full_name));

-- люди → специалисты заказчика
insert into public.customer_contacts(customer_id, full_name, position, phone, email, comment, sort)
select
  e.customer_id,
  e.full_name,
  e.position,
  e.phone,
  e.email,
  coalesce(e.comment, 'из внешних контактов'),
  coalesce((
    select max(cc.sort) from public.customer_contacts cc
    where cc.customer_id = e.customer_id and cc.deleted_at is null
  ), 0) + row_number() over (partition by e.customer_id order by e.sort, e.full_name)
from public.external_contacts e
where e.deleted_at is null
  and e.customer_id is not null
  and e.kind = 'person'
  and exists (
    select 1 from _seed_ext_contacts s
    where lower(trim(s.full_name)) = lower(trim(e.full_name))
  )
  and not exists (
    select 1 from public.customer_contacts cc
    where cc.customer_id = e.customer_id
      and cc.deleted_at is null
      and lower(trim(cc.full_name)) = lower(trim(e.full_name))
  );

commit;
