-- Бланк лаборатории «Интеграл» (табличная заявка) для видов: Интеграл, АНПИ, ДИ.

update public.request_types
set doc_template = 'lab_integral_docx'
where name in ('Интеграл', 'АНПИ', 'ДИ')
  and deleted_at is null
  and (doc_template is null or doc_template = '');

do $$
declare
  tid uuid;
  r record;
begin
  for r in
    select id, name from public.request_types
    where name in ('Интеграл', 'АНПИ', 'ДИ') and deleted_at is null
  loop
    tid := r.id;

    if not exists (
      select 1 from public.request_type_fields
      where request_type_id = tid and label = 'Время вызова' and deleted_at is null
    ) then
      insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
      values (tid, 'Время вызова', 'time', true, 'initiator', 8);
    end if;

    if not exists (
      select 1 from public.request_type_fields
      where request_type_id = tid and label = 'Метод контроля' and deleted_at is null
    ) then
      insert into public.request_type_fields(
        request_type_id, label, field_type, is_required, filled_by, sort, default_value
      )
      values (tid, 'Метод контроля', 'text', true, 'initiator', 9, '"Радиографический"'::jsonb);
    end if;

    if not exists (
      select 1 from public.request_type_fields
      where request_type_id = tid and label = 'Нормы контроля' and deleted_at is null
    ) then
      insert into public.request_type_fields(
        request_type_id, label, field_type, is_required, filled_by, sort, default_value
      )
      values (
        tid,
        'Нормы контроля',
        'textarea',
        false,
        'initiator',
        10,
        to_jsonb('СП 42-102-2004, СП 62.13330.2011 (СНиП 42-001-06), РД 01-001-06 и СП 42-103-2004'::text)
      );
    end if;

    if not exists (
      select 1 from public.request_type_fields
      where request_type_id = tid and label = 'Условия / виды работ' and deleted_at is null
    ) then
      insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
      values (tid, 'Условия / виды работ', 'textarea', true, 'initiator', 11);
    end if;

    if not exists (
      select 1 from public.request_type_fields
      where request_type_id = tid and label = 'Типоразмер и пикеты' and deleted_at is null
    ) then
      insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
      values (tid, 'Типоразмер и пикеты', 'textarea', false, 'initiator', 12);
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
        13,
        '"Балаев Юнус +7-999-999-00-65"'::jsonb
      );
    end if;

    if not exists (
      select 1 from public.request_type_fields
      where request_type_id = tid and label = 'Примечание' and deleted_at is null
    ) then
      insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
      values (tid, 'Примечание', 'textarea', false, 'initiator', 14);
    end if;

    if not exists (
      select 1 from public.request_type_fields
      where request_type_id = tid and label = 'Исх. №' and deleted_at is null
    ) then
      insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
      values (tid, 'Исх. №', 'text', false, 'office', 15);
    end if;
  end loop;
end $$;
