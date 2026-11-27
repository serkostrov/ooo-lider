-- Вложенность: организация / служба может содержать людей (parent_id).

alter table public.external_contacts
  add column if not exists parent_id uuid references public.external_contacts(id) on delete cascade;

create index if not exists external_contacts_parent_id_idx
  on public.external_contacts (parent_id)
  where deleted_at is null;

comment on column public.external_contacts.parent_id is
  'Родительская организация или служба. Только у kind=person; один уровень вложенности.';

-- Дочерние только person; родитель только org/service.
alter table public.external_contacts
  drop constraint if exists external_contacts_parent_kind_chk;

alter table public.external_contacts
  add constraint external_contacts_parent_kind_chk
  check (
    parent_id is null
    or kind = 'person'
  );

create or replace function public.external_contacts_parent_is_group()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.id is not null and new.parent_id = new.id then
    raise exception 'Контакт не может быть родителем сам себе';
  end if;
  select e.kind into v_kind
  from public.external_contacts e
  where e.id = new.parent_id
    and e.deleted_at is null;
  if v_kind is null then
    raise exception 'Родительский контакт не найден';
  end if;
  if v_kind not in ('org', 'service') then
    raise exception 'Вкладывать людей можно только в организацию или службу';
  end if;
  return new;
end;
$$;

drop trigger if exists external_contacts_parent_is_group_trg on public.external_contacts;
create trigger external_contacts_parent_is_group_trg
  before insert or update of parent_id, kind
  on public.external_contacts
  for each row
  execute function public.external_contacts_parent_is_group();
