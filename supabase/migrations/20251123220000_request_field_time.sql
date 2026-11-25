-- Тип поля «time» для «Время вызова» и подобных.

alter table public.request_type_fields
  drop constraint if exists request_type_fields_field_type_check;

alter table public.request_type_fields
  add constraint request_type_fields_field_type_check
  check (field_type in (
    'text','textarea','number','date','time','select','checkbox','file','picket_range'
  ));

update public.request_type_fields
set field_type = 'time'
where label = 'Время вызова'
  and deleted_at is null
  and field_type = 'text';
