-- =====================================================================
-- «Лидер» — правка 2.10: тип поля заявки «Пикеты (от – до)»
--
-- Новый тип поля 'picket_range': в форме — раздельный ввод
-- «от ПК [ ] + [ ] м — до ПК [ ] + [ ] м» с подсчётом длины участка.
-- Значение хранится как раньше — строкой «ПК 3+20 – ПК 4+60», поэтому
-- старые заявки, поиск, проверки обязательных полей и Excel не меняются.
--
-- Все существующие поля «Пикеты…» с типом «Текст» переводятся на новый тип.
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…07. Повторный запуск безопасен.
-- =====================================================================

do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.request_type_fields'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%field_type%'
  loop
    execute format('alter table public.request_type_fields drop constraint %I', c);
  end loop;
end $$;

alter table public.request_type_fields
  add constraint request_type_fields_field_type_check
  check (field_type in ('text','number','date','select','checkbox','file','picket_range'));

update public.request_type_fields
set field_type = 'picket_range'
where field_type = 'text' and label ilike 'пикет%' and deleted_at is null;

-- Проверка: полей нового типа больше нуля (по одному на каждый вид заявки с пикетами)
select
  (select count(*) from public.request_type_fields where field_type = 'picket_range' and deleted_at is null) as picket_fields,
  (select count(*) from public.request_type_fields where field_type = 'text' and label ilike 'пикет%' and deleted_at is null) as left_as_text;
