-- Просвет стыков (Интеграл): строка 7 бланка — регистрация проекта в УТН;
-- дефолты метода и условий по образцу «просвет стыков интеграл.docx».

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
      where request_type_id = tid
        and label = 'Номер и дата регистрации проекта в УТН'
        and deleted_at is null
    ) then
      insert into public.request_type_fields(
        request_type_id, label, field_type, is_required, filled_by, sort
      )
      values (tid, 'Номер и дата регистрации проекта в УТН', 'text', false, 'office', 16);
    end if;
  end loop;

  select id into tid from public.request_types
  where name = 'Интеграл' and deleted_at is null
  limit 1;

  if tid is null then
    return;
  end if;

  update public.request_type_fields
  set default_value = to_jsonb('Ультразвуковой / Радиографический'::text)
  where request_type_id = tid
    and label = 'Метод контроля'
    and deleted_at is null
    and (
      default_value is null
      or default_value = 'null'::jsonb
      or default_value = '"Радиографический"'::jsonb
    );

  update public.request_type_fields
  set default_value = to_jsonb(
    'Просим Вас произвести просвет стыков с получением результатов на месте'::text
  )
  where request_type_id = tid
    and label = 'Условия / виды работ'
    and deleted_at is null
    and (default_value is null or default_value = 'null'::jsonb);
end $$;
