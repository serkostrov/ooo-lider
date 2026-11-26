-- Сид реестра из РЕЕСТР.xlsx (Письма / Технадзор / Геотрест).
-- Идемпотентно: чистит записи этих журналов и заливает заново.

-- уникальность по журналу, не по legacy channel
drop index if exists public.registry_entries_channel_number_uidx;

-- убрать тестовый журнал lettersr, если был
update public.registry_entries e
set deleted_at = now(), updated_at = now()
from public.registry_journals j
where e.journal_id = j.id and j.code = 'lettersr' and e.deleted_at is null;

update public.registry_journals
set deleted_at = now(), is_active = false, updated_at = now()
where code = 'lettersr' and deleted_at is null;

do $$
declare
  v_letters uuid;
  v_tn uuid;
  v_geo uuid;
begin
  select id into v_letters from public.registry_journals where code = 'letters' and deleted_at is null;
  select id into v_tn from public.registry_journals where code = 'technadzor' and deleted_at is null;
  select id into v_geo from public.registry_journals where code = 'geotrest' and deleted_at is null;
  if v_letters is null or v_tn is null or v_geo is null then
    raise exception 'Журналы letters/technadzor/geotrest не найдены';
  end if;

  -- чистый сид из Excel: убираем текущие строки этих журналов (номера из файла)
  delete from public.registry_entries where journal_id in (v_letters, v_tn, v_geo);

  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 1, 'ООО «СтройГород»', '2026-02-05'::date, null, '2026-01-12'::date, '№1', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 2, 'ООО "ИК ТЭС"', '2026-02-16'::date, null, '2026-01-19'::date, '№5', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 3, 'ООО «СтройГород»', '2026-02-27'::date, null, '2026-01-26'::date, '№11', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 4, 'ООО «СтройГород»', '2026-02-04'::date, null, '2026-02-02'::date, '№16', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 5, 'ООО "ИК ТЭС"', '2026-05-07'::date, 'Заявка на материал Измайлово', '2026-02-09'::date, '№24', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 6, 'ООО "СтройГород"', '2026-05-12'::date, null, '2026-02-16'::date, '№31', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 7, 'ООО "СтройГород"', '2026-05-19'::date, null, '2026-02-16'::date, '№32', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 8, 'ООО "ИК ТЭС"', '2026-05-19'::date, 'Заявка на материал Римского-К', '2026-02-24'::date, '№47', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 9, 'АО «МОСГАЗ»', '2026-05-27'::date, 'КП аренда на благоустройство', '2026-03-03'::date, '№б/н', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 10, 'ООО "ИК ТЭС"', '2026-06-02'::date, 'Гарантийное п. Сиреневый б-р', '2026-03-10'::date, '№68', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 11, 'ООО "ИК ТЭС"', '2026-06-03'::date, 'Аванс на КС№2 алтушка', '2026-03-16'::date, '№80', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 12, 'ООО "Ставропольнефтегаз"', '2026-06-04'::date, 'Просьба о расторжении', '2026-03-25'::date, '№75', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 13, 'ООО "СтройГород"', '2026-06-04'::date, 'Просьба закопать котлован', '2026-03-26'::date, '№102', 'Устранить провалы Внуково', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 14, 'ООО "Гранд Неруд"', '2026-06-11'::date, 'Возврат ДС', '2026-03-30'::date, '№107', 'Устранить провалы Внуково', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 15, 'ООО "СтройГород"', '2026-06-18'::date, 'Завершение работ', '2026-03-30'::date, '№108', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 16, 'АО «МОСГАЗ»', '2026-06-26'::date, 'УКС Скориковой о получении тех зад по ЭХЗ', '2026-04-06'::date, '№125', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 17, 'АО «МОСГАЗ»', '2026-07-03'::date, null, '2026-05-07'::date, '№179', 'Приступить к работе Измайлово', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 18, 'СРО', '2026-08-07'::date, 'Возврат ДС', '2026-05-13'::date, '№188', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 19, 'АО «МОСГАЗ»', '2026-08-19'::date, 'Анкета участника закупки (бараново)', '2026-05-19'::date, '№203', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 20, 'ООО "ИК ТЭС"', '2026-09-23'::date, 'Завершение работ Горбатый мост', '2026-05-27'::date, '№218', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 21, 'АО «МОСГАЗ»', '2026-10-01'::date, 'Заявка на пропуск (сусальный)', '2026-06-01'::date, '№235', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 22, 'АО «МОСГАЗ»', '2026-10-01'::date, 'Заявка на пропуск ( мрузовский)', '2026-06-03'::date, '№73-870', 'Требование о поставке МТР', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 23, 'АО «МОСГАЗ»', '2026-10-02'::date, 'Заявка на выдачу документации', '2026-06-08'::date, '№258', 'Замечание - Сиреневый', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 24, 'АО «МОСГАЗ»', '2026-10-02'::date, 'Заявка на пропуск (сусальный)', '2026-06-08'::date, '№260', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 25, 'АО «МОСГАЗ»', '2026-10-02'::date, 'Заявка на пропуск ( мрузовский)', '2026-06-10'::date, '№275', 'Замечание - Внуково', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 26, 'АО «МОСГАЗ»', '2026-10-06'::date, 'Дав. Материал ( Бараново)', '2026-06-10'::date, '№796/06', 'Назначение Директора', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 27, 'Директору ГБУ', '2026-10-07'::date, 'Жилищник ( Бараново)', '2026-06-15'::date, '№ 286', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 28, 'Директору ГБУ', '2026-10-07'::date, 'Жилищник ( Бараново)- повтор', '2026-06-22'::date, '№307', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 29, 'АО «МОСГАЗ»', '2026-10-14'::date, 'Заявка технадзор', '2026-06-25'::date, '№314', 'Замечание - Сиреневый', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 30, 'АО «МОСГАЗ»', '2026-10-15'::date, 'Заявка технадзор (повтор)', '2026-06-29'::date, '№319', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 31, 'ПРЕФЕКТУРА', '2026-10-15'::date, 'Строительный городок', '2026-07-13'::date, '№354', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 32, 'АО «МОСГАЗ»', '2026-10-19'::date, 'Заключение договора', '2026-07-20'::date, '№372', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 33, 'АО «Мосводоканал»', '2026-10-22'::date, 'Соглосовать проект производства  (Бараново)', '2026-07-27'::date, '№392', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 34, 'АО «Мосводоканал»', '2026-10-22'::date, 'Гарантийное письмо (Бараново)', '2026-08-03'::date, '№406', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 35, 'АО «МОСГАЗ»', '2026-10-22'::date, 'Гарантийное письмо (Заречная)', '2026-08-10'::date, '№419', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 36, 'АО «МОСГАЗ»', '2026-10-22'::date, 'Гарантийное письмо (Заречная)', '2026-08-10'::date, '№420', 'Замечание - Внуково', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 37, 'Газпромбанк', '2026-10-23'::date, 'Претензия', '2026-08-31'::date, '№468', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 38, 'АО «МОСГАЗ»', '2026-10-23'::date, 'акт приема-передач стр площадки', '2026-09-07'::date, '№484', 'Оповещение совещания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 39, 'АО «МОСГАЗ»', '2026-10-27'::date, 'Соглосовать материал', '2026-10-01'::date, '№21', 'Заявка на пропуск (сусальный)', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 40, 'Жилищник', '2026-10-28'::date, 'уведомление о вырубке', '2026-10-01'::date, '№22', 'Заявка на пропуск (мрузовский)', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 41, 'Экологический контроль', '2026-10-28'::date, 'уведомление о вырубке', '2026-10-02'::date, '№24', 'Заявка на пропуск ( сусальный)', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 42, 'Префектура', '2026-10-28'::date, 'уведомление о вырубке', '2026-10-02'::date, '№25', 'Заявка на пропуск ( мрузовский)', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 43, 'Лаб. МОСГАЗ', '2026-10-29'::date, 'Заявка просвет стыков', '2026-10-15'::date, '№30', 'Заявка технадзор рег', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 44, 'АО «МОСГАЗ»', '2026-11-06'::date, 'Заявка на пропуск ( Мрузовский)', '2026-10-19'::date, '№31', 'Ордер', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 62, 'АО «МОСГАЗ»', '2026-11-12'::date, 'Гарантийное оплата ремонта', '2026-10-19'::date, '№32', 'Заключение договор', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 45, 'ПАО «Россети»', '2026-11-09'::date, 'Гранатийные обязательства', '2026-10-27'::date, '№33', 'Жилищник', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 63, 'АО «МОСГАЗ»', '2026-11-12'::date, 'Уведомление роведение работ', '2026-11-05'::date, '№627', 'Замечания', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 46, 'АО «МОСГАЗ»', '2026-11-12'::date, 'Просвет стыков', '2026-11-05'::date, '№627', 'Регистрация проекта', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 47, 'ООО «Интеграл»', '2026-11-12'::date, 'Просвет стыков', '2026-11-06'::date, '№44', 'Заявка на пропуск (мрузовский)', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 48, 'ООО «Интеграл»', '2026-11-13'::date, 'ДИ', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 49, 'АО «МОСГАЗ»', '2026-11-16'::date, 'Гарантийное письмо', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 50, 'ООО «Интеграл»', '2026-11-18'::date, 'Заявка просвет стыков', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 51, 'АО «МОСГАЗ»', '2026-11-19'::date, 'Заявка просвет стыков', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 52, 'АО «МОСГАЗ»', '2026-11-20'::date, 'Заявка просвет стыков', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 53, 'АО «МОСГАЗ»', '2026-11-20'::date, 'Заявка УЭГНД на 1-ое опоршнение', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 54, 'АО «МОСГАЗ»', '2026-11-23'::date, 'Заявка просвет стыков', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 55, 'АО «МОСГАЗ»', '2026-11-23'::date, 'Заявка просвет стыков', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 56, 'АО «МОСГАЗ»', '2026-11-23'::date, 'Уведомление о начале работ', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 57, 'АО «МОСГАЗ»', '2026-11-24'::date, 'Гарантийное письмо', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 58, 'ООО «Интеграл»', '2026-11-24'::date, 'АНПИ', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 59, 'ООО «Интеграл»', '2026-11-24'::date, 'Просвет стыков', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 60, 'ООО «Интеграл»', '2026-11-26'::date, 'ДИ', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, in_date, in_letter_no, in_content, extra)
  values (v_letters, 'letters', 61, 'АО «МОСГАЗ»', '2026-11-26'::date, 'Заявка УЭГНД на 1-ое опоршнение', null, null, null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, extra)
  values (v_tn, 'technadzor', 1, 'АО «МОСГАЗ»', '2026-11-12'::date, 'Монтаж трубы в траншею', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, extra)
  values (v_tn, 'technadzor', 2, 'АО «МОСГАЗ»', '2026-11-17'::date, 'Приемка трубы в траншею', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, extra)
  values (v_tn, 'technadzor', 3, 'АО «МОСГАЗ»', '2026-11-20'::date, 'Прочистка поршнения', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, counterparty, out_date, out_content, extra)
  values (v_tn, 'technadzor', 4, 'АО «МОСГАЗ»', '2026-11-26'::date, 'Прочистка поршнения', '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, out_content, in_letter_no, in_content, out_date, extra)
  values (v_geo, 'geotrest', 1, '1. КГС на 18.09.2026
2. 24.109 Выполнение работ по догазификации населенных пунктов г. Москвы. Строительство подводящих газопроводов до населенного пункта по адресу г. Москва, НАО, Филимонковский район, деревня Бараново. 
3. Газопровод 100 п.м.
4. Г. Москва, деревня Бараново, Новая улица, 11
5. Ответственный на объекте: Васильев Кирилл Сергеевич +7 977 750 00 97', '2329', '2329
б/н
24.109 Выполнение работ по догазификации населенных пунктов г. Москвы. Строительство подводящих газопроводов до населенного пункта по адресу г. Москва, НАО, Филимонковский район, деревня Бараново.
Москва, деревня Бараново, Новая улица, 11
Газопровод 100 п.м.
Васильев Кирилл Сергеевич
8 977 750 00 97
18.11.26
УКС', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, out_content, in_letter_no, in_content, out_date, extra)
  values (v_geo, 'geotrest', 2, '1. КГС на 23.11.2026
2. 24.109 Выполнение работ по догазификации населенных пунктов г. Москвы. «Строительство подводящих газопроводов до населенного пункта по адресу г. Москва, НАО, Филимонковский район, деревня Бараново»
3.  Газопровод: 48 метров (труба-160)
4. г. Москва Бараново ул. Новая 11
5. Павел 8(926)267-91-18', '2351', '2351
б/н
24.109 Выполнение работ по догазификации населенных пунктов г. Москвы. Строительство подводящих газопроводов до населенного пункта по адресу г. Москва, НАО, Филимонковский район, деревня Бараново.
Москва, деревня Бараново, Новая улица, 11
Газопровод 48 п.м.
Сокуренко Павел Александрович
8(926)267-91-18
23.11.26
УКС', null, '{}'::jsonb);
  insert into public.registry_entries(journal_id, channel, number, out_content, in_letter_no, in_content, out_date, extra)
  values (v_geo, 'geotrest', 3, '1. КГС на 27.11.2026

2. 24.109 Выполнение работ по догазификации населенных пунктов г. Москвы. «Строительство подводящих газопроводов до населенного пункта по адресу г. Москва, НАО, Филимонковский район, деревня Бараново»

3. Газопровод: 29 метров (труба: 160-13м,110-16м)

4. г. Москва Бараново ул. Новая 11

5. Сокуренко Павел Александрович
8(926)267-91-18', '2392', '2392
б/н
24.109 Выполнение работ по догазификации населенных пунктов г. Москвы. Строительство подводящих газопроводов до населенного пункта по адресу г. Москва, НАО, Филимонковский район, деревня Бараново.
Москва, деревня Бараново, Новая улица, 11
Газопровод 29 п.м.
Сокуренко Павел Александрович
8(926)267-91-18
27.11.26
УКС', null, '{}'::jsonb);
end $$;

-- права UI-реестра: только is_admin (админ + руководитель).
-- Канцелярия по-прежнему пишет через SECURITY DEFINER RPC (upsert_on_sent / accept).
drop policy if exists registry_entries_select on public.registry_entries;
create policy registry_entries_select on public.registry_entries
  for select to authenticated
  using (deleted_at is null and public.is_admin() and (object_id is null or public.can_see_object(object_id)));
drop policy if exists registry_entries_insert on public.registry_entries;
create policy registry_entries_insert on public.registry_entries
  for insert to authenticated with check (public.is_admin());
drop policy if exists registry_entries_update on public.registry_entries;
create policy registry_entries_update on public.registry_entries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

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
  if not public.is_admin() then
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

create or replace function public.registry_soft_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Нет прав';
  end if;
  update public.registry_entries
  set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
end $$;
