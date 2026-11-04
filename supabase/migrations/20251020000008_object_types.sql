-- =====================================================================
-- «Лидер» — правка 2.5: «Тип объекта» — настраиваемый справочник
--
-- Было: objects.object_type ограничен двумя значениями прямо в схеме
-- (check in ('uks','urip')), подписи «УКС» / «УРиП» зашиты в интерфейсе.
-- Стало: справочник public.object_types (код, название, порядок);
-- objects.object_type ссылается на него. Существующие объекты не меняются:
-- коды 'uks' и 'urip' остаются, им заводятся строки «УКС» и «УРиП».
--
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…06. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.object_types (
  code        text primary key default ('t' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  name        text not null unique,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

insert into public.object_types(code, name, sort) values
  ('uks',  'УКС',  1),
  ('urip', 'УРиП', 2)
on conflict (code) do nothing;

-- Снимаем жёсткий список значений и ставим ссылку на справочник
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.objects'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%object_type%'
  loop
    execute format('alter table public.objects drop constraint %I', c);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'objects_object_type_fkey') then
    alter table public.objects
      add constraint objects_object_type_fkey foreign key (object_type)
      references public.object_types(code) on update cascade;
  end if;
end $$;

-- Права — как у остальных справочников
alter table public.object_types enable row level security;
drop policy if exists object_types_sel on public.object_types;
drop policy if exists object_types_adm on public.object_types;
create policy object_types_sel on public.object_types for select to authenticated using (true);
create policy object_types_adm on public.object_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.object_types to authenticated;

-- Проверка: типов ≥ 2, ссылка на справочник есть, объектов с неизвестным типом 0
select
  (select count(*) from public.object_types where deleted_at is null) as types,
  (select count(*) from pg_constraint where conname = 'objects_object_type_fkey') as fk_ok,
  (select count(*) from public.objects o
     where not exists (select 1 from public.object_types t where t.code = o.object_type)) as orphans;
