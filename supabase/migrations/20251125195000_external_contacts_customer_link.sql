-- Внешние контакты → заказчик (необязательно) + копирование людей Мосгаза в специалисты.

alter table public.external_contacts
  add column if not exists customer_id uuid references public.customers(id);

create index if not exists external_contacts_customer_id_idx
  on public.external_contacts (customer_id)
  where deleted_at is null and customer_id is not null;

comment on column public.external_contacts.customer_id is
  'Если задан — контакт относится к этому заказчику (можно дублировать в customer_contacts).';

-- --- Заказчики под организации из «АДРЕСА», если ещё нет ---
insert into public.customers(name, comment)
select v.name, v.comment
from (values
  ('ООО «Интеграл»', 'Лаборатория из справочника внешних контактов'),
  ('ПАО «Россети»', 'Из справочника внешних контактов'),
  ('АО «Мосводоканал»', 'Из справочника внешних контактов')
) as v(name, comment)
where not exists (
  select 1 from public.customers c
  where c.deleted_at is null
    and lower(replace(replace(c.name, '«', '"'), '»', '"'))
      = lower(replace(replace(v.name, '«', '"'), '»', '"'))
);

-- --- Привязка внешних контактов к заказчикам ---
do $$
declare
  v_mosgaz uuid;
  v_integral uuid;
  v_rosseti uuid;
  v_vodokanal uuid;
begin
  select id into v_mosgaz from public.customers
  where deleted_at is null and name ilike '%МОСГАЗ%' order by created_at limit 1;

  select id into v_integral from public.customers
  where deleted_at is null and name ilike '%Интеграл%' order by created_at limit 1;

  select id into v_rosseti from public.customers
  where deleted_at is null and name ilike '%Россет%' order by created_at limit 1;

  select id into v_vodokanal from public.customers
  where deleted_at is null and name ilike '%Мосводоканал%' order by created_at limit 1;

  if v_mosgaz is not null then
    update public.external_contacts e
    set customer_id = v_mosgaz
    where e.deleted_at is null
      and e.customer_id is null
      and (
        e.full_name ~* 'мосгаз|одноокно'
        or coalesce(e.position, '') ~* 'мосгаз'
        or e.full_name in ('Технадзор', 'ГВСД ГРС УЭНГД', 'Снабжение', 'Регистрация Журналов', 'Жилищник')
        or (e.kind = 'person' and coalesce(e.position, '') ~* 'мосгаз|утн|укс|урип|гвсд|уэгно|уэнгд')
      );
  end if;

  if v_integral is not null then
    update public.external_contacts e
    set customer_id = v_integral
    where e.deleted_at is null
      and e.customer_id is null
      and (
        e.full_name ~* 'интеграл'
        or coalesce(e.position, '') ~* 'интеграл'
      );
  end if;

  if v_rosseti is not null then
    update public.external_contacts e
    set customer_id = v_rosseti
    where e.deleted_at is null
      and e.customer_id is null
      and e.full_name ~* 'россет';
  end if;

  if v_vodokanal is not null then
    update public.external_contacts e
    set customer_id = v_vodokanal
    where e.deleted_at is null
      and e.customer_id is null
      and e.full_name ~* 'мосводоканал';
  end if;
end $$;

-- --- Специалисты заказчика из внешних контактов (люди), без дублей по ФИО ---
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
  and not exists (
    select 1 from public.customer_contacts cc
    where cc.customer_id = e.customer_id
      and cc.deleted_at is null
      and lower(trim(cc.full_name)) = lower(trim(e.full_name))
  );
