-- Тип внешнего контакта: человек / организация / служба.
-- Телефон и почта хранят несколько значений текстом (через ; или перенос).

alter table public.external_contacts
  add column if not exists kind text not null default 'person'
    check (kind in ('person', 'org', 'service'));

comment on column public.external_contacts.kind is
  'person — ФИО; org — организация; service — служба / отдел.';

-- Бывшие «Организация / служба» из импорта АДРЕСА.xlsx
update public.external_contacts
set kind = 'org',
    position = nullif(trim(coalesce(position, '')), 'Организация / служба')
where deleted_at is null
  and (
    position = 'Организация / служба'
    or full_name ~* '^(АО|ООО|Лаб\.|Технадзор|Префектура|Россет|Мосводоканал|ГВСД|Жилищник|Снабжение|Департамент|Регистрация|Одноокно)'
  );

-- Службы без ФИО-паттерна
update public.external_contacts
set kind = 'service'
where deleted_at is null
  and kind = 'org'
  and full_name ~* '^(Технадзор|Регистрация Журналов|Снабжение)$';
