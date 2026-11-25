-- Справочник шаблонов бланков заявок (конструктор).
-- Вид заявки ссылается на шаблон; doc_template синхронизируется с engine шаблона.

create table if not exists public.request_blank_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- word_table | word_fax | excel | message
  format      text not null,
  -- код существующего генератора: technadzor_xlsx, lab_mosgaz_docx, …
  engine      text,
  -- JSON конфига конструктора (BlankConfig)
  config      jsonb not null default '{}'::jsonb,
  sort        int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.request_blank_templates is
  'Шаблоны бланков заявок из конструктора; привязываются к request_types';
comment on column public.request_blank_templates.format is
  'Формат UI-конструктора: word_table, word_fax, excel, message';
comment on column public.request_blank_templates.engine is
  'Код генератора файла (как request_types.doc_template), пока generic-движка нет';
comment on column public.request_blank_templates.config is
  'Настройки конструктора: блоки, строки, шаблон текста и т.п.';

create index if not exists request_blank_templates_active_sort_idx
  on public.request_blank_templates (sort)
  where deleted_at is null;

alter table public.request_types
  add column if not exists blank_template_id uuid
    references public.request_blank_templates(id);

comment on column public.request_types.blank_template_id is
  'Шаблон бланка из справочника; doc_template копируется из engine шаблона';

create index if not exists request_types_blank_template_id_idx
  on public.request_types (blank_template_id)
  where deleted_at is null and blank_template_id is not null;

alter table public.request_blank_templates enable row level security;

drop policy if exists request_blank_templates_sel on public.request_blank_templates;
create policy request_blank_templates_sel on public.request_blank_templates
  for select to authenticated using (true);

drop policy if exists request_blank_templates_adm on public.request_blank_templates;
create policy request_blank_templates_adm on public.request_blank_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Стартовые шаблоны под текущие генераторы (идемпотентно по имени)
do $$
declare
  t_excel uuid;
  t_fax uuid;
  t_table uuid;
  t_integral uuid;
  t_msg uuid;
begin
  if not exists (
    select 1 from public.request_blank_templates
    where name = 'Технадзор (Excel)' and deleted_at is null
  ) then
    insert into public.request_blank_templates(name, format, engine, config, sort)
    values (
      'Технадзор (Excel)',
      'excel',
      'technadzor_xlsx',
      '{"format":"excel","letterhead":false,"recipientLines":[],"showDirectorBlock":false,"tableRows":[],"faxTitle":"","faxBody":"","excelColumns":[],"messageTemplate":""}'::jsonb,
      10
    )
    returning id into t_excel;
  else
    select id into t_excel from public.request_blank_templates
    where name = 'Технадзор (Excel)' and deleted_at is null limit 1;
  end if;

  if not exists (
    select 1 from public.request_blank_templates
    where name = 'Лаборатория МГ — факс' and deleted_at is null
  ) then
    insert into public.request_blank_templates(name, format, engine, config, sort)
    values (
      'Лаборатория МГ — факс',
      'word_fax',
      'lab_mosgaz_docx',
      '{"format":"word_fax","letterhead":true,"recipientLines":["Начальнику УЭГНД"],"showDirectorBlock":true,"tableRows":[],"faxTitle":"ФАКСОГРАММА","faxBody":"","excelColumns":[],"messageTemplate":""}'::jsonb,
      20
    )
    returning id into t_fax;
  else
    select id into t_fax from public.request_blank_templates
    where name = 'Лаборатория МГ — факс' and deleted_at is null limit 1;
  end if;

  if not exists (
    select 1 from public.request_blank_templates
    where name = 'Лаборатория МГ — таблица' and deleted_at is null
  ) then
    insert into public.request_blank_templates(name, format, engine, config, sort)
    values (
      'Лаборатория МГ — таблица',
      'word_table',
      'lab_mosgaz_table_docx',
      '{"format":"word_table","letterhead":true,"recipientLines":[],"showDirectorBlock":true,"tableRows":[],"faxTitle":"","faxBody":"","excelColumns":[],"messageTemplate":""}'::jsonb,
      30
    )
    returning id into t_table;
  else
    select id into t_table from public.request_blank_templates
    where name = 'Лаборатория МГ — таблица' and deleted_at is null limit 1;
  end if;

  if not exists (
    select 1 from public.request_blank_templates
    where name = 'Лаборатория Интеграл' and deleted_at is null
  ) then
    insert into public.request_blank_templates(name, format, engine, config, sort)
    values (
      'Лаборатория Интеграл',
      'word_table',
      'lab_integral_docx',
      '{"format":"word_table","letterhead":true,"recipientLines":[],"showDirectorBlock":true,"tableRows":[],"faxTitle":"","faxBody":"","excelColumns":[],"messageTemplate":""}'::jsonb,
      40
    )
    returning id into t_integral;
  else
    select id into t_integral from public.request_blank_templates
    where name = 'Лаборатория Интеграл' and deleted_at is null limit 1;
  end if;

  if not exists (
    select 1 from public.request_blank_templates
    where name = 'Геотрест — сообщение' and deleted_at is null
  ) then
    insert into public.request_blank_templates(name, format, engine, config, sort)
    values (
      'Геотрест — сообщение',
      'message',
      'geotrest_message',
      '{"format":"message","letterhead":false,"recipientLines":[],"showDirectorBlock":false,"tableRows":[],"faxTitle":"","faxBody":"","excelColumns":[],"messageTemplate":""}'::jsonb,
      50
    )
    returning id into t_msg;
  else
    select id into t_msg from public.request_blank_templates
    where name = 'Геотрест — сообщение' and deleted_at is null limit 1;
  end if;

  -- Привязать существующие виды по doc_template
  update public.request_types
  set blank_template_id = t_excel
  where doc_template = 'technadzor_xlsx'
    and deleted_at is null
    and blank_template_id is null
    and t_excel is not null;

  update public.request_types
  set blank_template_id = t_fax
  where doc_template = 'lab_mosgaz_docx'
    and deleted_at is null
    and blank_template_id is null
    and t_fax is not null;

  update public.request_types
  set blank_template_id = t_table
  where doc_template = 'lab_mosgaz_table_docx'
    and deleted_at is null
    and blank_template_id is null
    and t_table is not null;

  update public.request_types
  set blank_template_id = t_integral
  where doc_template = 'lab_integral_docx'
    and deleted_at is null
    and blank_template_id is null
    and t_integral is not null;

  update public.request_types
  set blank_template_id = t_msg
  where doc_template = 'geotrest_message'
    and deleted_at is null
    and blank_template_id is null
    and t_msg is not null;
end $$;
