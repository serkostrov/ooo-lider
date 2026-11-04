-- =====================================================================
-- «Лидер» — правка 2.3: файлы «От нас» и «Ждём» у этапов справочника
--
-- Раньше в справочнике этапов «От нас» (исходящий документ) и «Ждём»
-- (ответный документ) были только текстом. Теперь к каждому из них можно
-- приложить несколько файлов-образцов (бланк письма, пример ответа и т. п.).
-- Файлы видны всем сотрудникам — в справочнике и в карточке этапа на объекте.
--
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…05. Повторный запуск безопасен.
-- Ничего существующего не меняет: новая таблица и новое хранилище.
--
-- Почему отдельное хранилище, а не lider-files: правила доступа lider-files
-- берут первую папку пути как id объекта; у файлов справочника объекта нет.
-- =====================================================================

create table if not exists public.stage_template_files (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.stage_templates(id),
  kind          text not null check (kind in ('outgoing', 'expected')),   -- «От нас» / «Ждём»
  storage_path  text not null,          -- хранилище lider-templates: {template_id}/{kind}/{uuid}-{имя}
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists stage_template_files_template_idx on public.stage_template_files(template_id);

-- Права — как у остальных справочников: читают все, правят администратор и руководитель
alter table public.stage_template_files enable row level security;
drop policy if exists stage_template_files_sel on public.stage_template_files;
drop policy if exists stage_template_files_adm on public.stage_template_files;
create policy stage_template_files_sel on public.stage_template_files
  for select to authenticated using (true);
create policy stage_template_files_adm on public.stage_template_files
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.stage_template_files to authenticated;

-- Хранилище
insert into storage.buckets(id, name, public) values ('lider-templates', 'lider-templates', false)
on conflict (id) do nothing;

drop policy if exists lider_templates_read on storage.objects;
drop policy if exists lider_templates_write on storage.objects;
drop policy if exists lider_templates_delete on storage.objects;
create policy lider_templates_read on storage.objects for select to authenticated
  using (bucket_id = 'lider-templates');
create policy lider_templates_write on storage.objects for insert to authenticated
  with check (bucket_id = 'lider-templates' and public.is_admin());
create policy lider_templates_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lider-templates' and public.is_admin());

-- Проверка: таблица есть, хранилище есть, политик хранилища 3
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'stage_template_files') as table_ok,
  (select count(*) from storage.buckets where id = 'lider-templates') as bucket_ok,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'lider_templates_%') as storage_policies;
