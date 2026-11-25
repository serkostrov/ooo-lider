-- Бланк «Лаборатория МГ»: факсограмма (lab_mosgaz_docx).
-- Поля для текста письма + привязка вида к генератору.

update public.request_types
set doc_template = 'lab_mosgaz_docx'
where name = 'Лаборатория МГ'
  and deleted_at is null
  and (doc_template is null or doc_template = '');

do $$
declare
  tid uuid;
begin
  select id into tid from public.request_types
  where name = 'Лаборатория МГ' and deleted_at is null
  order by sort limit 1;
  if tid is null then return; end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Время вызова' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Время вызова', 'time', true, 'initiator', 8);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Виды работ' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Виды работ', 'textarea', true, 'initiator', 9);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Ответственный за производство работ' and deleted_at is null
  ) then
    insert into public.request_type_fields(
      request_type_id, label, field_type, is_required, filled_by, sort, default_value
    )
    values (
      tid,
      'Ответственный за производство работ',
      'text',
      true,
      'initiator',
      10,
      '"Балаев Юнус +7-999-999-00-65"'::jsonb
    );
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Примечание' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Примечание', 'textarea', false, 'initiator', 11);
  end if;

  if not exists (
    select 1 from public.request_type_fields
    where request_type_id = tid and label = 'Исх. №' and deleted_at is null
  ) then
    insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
    values (tid, 'Исх. №', 'text', false, 'office', 12);
  end if;
end $$;
