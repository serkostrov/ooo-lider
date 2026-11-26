-- Привязка контрагентов реестра к именам из справочника customers
-- (в Excel были прямые кавычки / короткие названия).

update public.registry_entries
set counterparty = 'АО «МОСГАЗ»', updated_at = now()
where deleted_at is null
  and counterparty in ('АО "МОСГАЗ"', 'АО «МОСГАЗ»', 'АО МОСГАЗ');

update public.registry_entries
set counterparty = 'АО «Мосводоканал»', updated_at = now()
where deleted_at is null
  and upper(replace(replace(replace(counterparty, '«', '"'), '»', '"'), '„', '"'))
      in ('АО "МОСВОДОКАНАЛ"', 'АО МОСВОДОКАНАЛ');

update public.registry_entries
set counterparty = 'ООО «Интеграл»', updated_at = now()
where deleted_at is null
  and upper(trim(counterparty)) in ('ИНТЕГРАЛ', 'ООО "ИНТЕГРАЛ"', 'ООО «ИНТЕГРАЛ»');

update public.registry_entries
set counterparty = 'ПАО «Россети»', updated_at = now()
where deleted_at is null
  and upper(trim(counterparty)) in ('РОССЕТИ', 'ПАО "РОССЕТИ"', 'ПАО «РОССЕТИ»');
