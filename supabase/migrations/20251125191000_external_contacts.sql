-- Справочник «Внешние контакты» + привязка к этапам объекта.

create table if not exists public.external_contacts (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  position    text,
  phone       text,
  email       text,
  comment     text,
  is_active   boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.external_contacts is
  'Внешние контакты (не сотрудники и не контакты заказчика): ФИО, должность, почта, телефон.';

create table if not exists public.object_stage_external_contacts (
  id          uuid primary key default gen_random_uuid(),
  stage_id    uuid not null references public.object_stages(id) on delete cascade,
  contact_id  uuid not null references public.external_contacts(id),
  created_at  timestamptz not null default now(),
  unique (stage_id, contact_id)
);

create index if not exists object_stage_external_contacts_stage_idx
  on public.object_stage_external_contacts (stage_id);
create index if not exists object_stage_external_contacts_contact_idx
  on public.object_stage_external_contacts (contact_id);

comment on table public.object_stage_external_contacts is
  'Контакты из справочника «Внешние контакты», привязанные к этапу объекта.';

alter table public.external_contacts enable row level security;
alter table public.object_stage_external_contacts enable row level security;

drop policy if exists external_contacts_sel on public.external_contacts;
create policy external_contacts_sel on public.external_contacts
  for select to authenticated using (true);

drop policy if exists external_contacts_adm on public.external_contacts;
create policy external_contacts_adm on public.external_contacts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Читать могут участники объекта; править — админ/руководитель или участник этапа.
drop policy if exists object_stage_external_contacts_sel on public.object_stage_external_contacts;
create policy object_stage_external_contacts_sel on public.object_stage_external_contacts
  for select to authenticated
  using (
    exists (
      select 1 from public.object_stages s
      where s.id = stage_id and public.can_see_object(s.object_id)
    )
  );

drop policy if exists object_stage_external_contacts_ins on public.object_stage_external_contacts;
create policy object_stage_external_contacts_ins on public.object_stage_external_contacts
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.object_stages s
      where s.id = stage_id and public.can_see_object(s.object_id)
    )
  );

drop policy if exists object_stage_external_contacts_del on public.object_stage_external_contacts;
create policy object_stage_external_contacts_del on public.object_stage_external_contacts
  for delete to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.object_stages s
      where s.id = stage_id and public.can_see_object(s.object_id)
    )
  );

grant select, insert, update, delete on public.external_contacts to authenticated;
grant select, insert, delete on public.object_stage_external_contacts to authenticated;
