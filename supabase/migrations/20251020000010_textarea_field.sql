-- =====================================================================
-- «Лидер» — правка 2.11: тип поля заявки «Многострочный текст»
--
-- Новый тип поля 'textarea' — в форме поле в несколько строк.
-- Значение — та же строка, что у «Текста», поэтому старые заявки,
-- поиск и Excel не меняются. Поля «Комментарий…» переводятся на новый тип.
--
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…08. Повторный запуск безопасен.
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
  check (field_type in ('text','textarea','number','date','select','checkbox','file','picket_range'));

update public.request_type_fields
set field_type = 'textarea'
where field_type = 'text' and label ilike 'комментарий%' and deleted_at is null;

-- Проверка: полей «Комментарий…» в несколько строк больше нуля, обычным текстом не осталось
select
  (select count(*) from public.request_type_fields where field_type = 'textarea' and deleted_at is null) as textarea_fields,
  (select count(*) from public.request_type_fields where field_type = 'text' and label ilike 'комментарий%' and deleted_at is null) as left_as_text;
