-- =============================================================================
-- Демо-заявки со заполненными полями под бланки (статус ready).
-- Скопируй в Supabase → SQL Editor → Run
-- Нужен хотя бы один активный объект и профили прораба/офиса.
-- =============================================================================

do $$ begin perform set_config('lider.rpc', 'on', true); end $$;

do $$
declare
  v_obj uuid;
  v_foreman uuid;
  v_office uuid;
  v_today date := public.msk_today();
  r record;
  tid uuid;
  rid uuid;
  v_no bigint;
begin
  select id into v_obj
  from public.objects
  where deleted_at is null
  order by created_at desc nulls last
  limit 1;
  if v_obj is null then
    raise exception 'Нет активного объекта — сначала создай объект';
  end if;

  select p.id into v_foreman
  from public.profiles p
  where p.deleted_at is null
    and exists (
      select 1 from public.profile_roles pr
      where pr.profile_id = p.id and pr.role_code in ('foreman', 'pto')
    )
  order by p.full_name nulls last
  limit 1;

  select p.id into v_office
  from public.profiles p
  where p.deleted_at is null
    and exists (
      select 1 from public.profile_roles pr
      where pr.profile_id = p.id and pr.role_code = 'office'
    )
  order by p.full_name nulls last
  limit 1;

  if v_foreman is null then
    select id into v_foreman from public.profiles where deleted_at is null limit 1;
  end if;
  if v_office is null then
    v_office := v_foreman;
  end if;

  for r in
    select * from (values
      ('Интеграл', jsonb_build_object(
        'Пикеты (от – до)', 'ПК 0+00 – ПК 0+50',
        'Время вызова', '09-00',
        'Метод контроля', 'Ультразвуковой / Радиографический',
        'Условия / виды работ', 'Просим Вас произвести просвет стыков с получением результатов на месте',
        'Типоразмер и пикеты', 'ПНД Ду 160х14,5 мм — 3 стыка',
        'Ответственный за производство работ', 'Павел 8(926)267-91-18',
        'Исх. №', '52'
      )),
      ('Лаборатория МГ', jsonb_build_object(
        'Пикеты (от – до)', 'ПК 0+10 – ПК 0+40',
        'Время вызова', '09-00',
        'Метод контроля', 'Ультразвуковой',
        'Условия / виды работ', 'Просим Вас произвести просвет стыков с получением результатов на месте',
        'Типоразмер и пикеты', 'ПЭ Ду 110х10 мм — 1 стык н.д.; Ду 160х14,6 — 3 стыка н.д.',
        'Ответственный за производство работ', 'Павел 8(926)267-91-18',
        'Виды работ', 'просвет стыков',
        'Исх. №', '46'
      )),
      ('АНПИ', jsonb_build_object(
        'Пикеты (от – до)', 'ПК 0+36,1 – ПК 0+38,1',
        'Время вызова', '09-00',
        'Метод контроля', 'АНПИ',
        'Условия / виды работ', 'Просим Вас произвести контроль изоляции',
        'Типоразмер и пикеты', 'Сталь кран Ду108 ПК0+36,1 до ПК0+38,1',
        'Ответственный за производство работ', 'Павел 8(926)267-91-18',
        'Исх. №', '58'
      )),
      ('ДИ', jsonb_build_object(
        'Пикеты (от – до)', 'ПК 0+00 – ПК 0+10',
        'Время вызова', '09-00',
        'Метод контроля', 'ДИ',
        'Типоразмер и пикеты', 'ДИ: кран «бивал» д.108 — 1 м; д.159 — 1 м',
        'Ответственный за производство работ', 'Павел 8(926)267-91-18',
        'Исх. №', '48'
      )),
      ('Адгезия', jsonb_build_object(
        'Пикеты (от – до)', 'ПК 1+00 – ПК 1+20',
        'Время вызова', '11-00',
        'Метод контроля', 'АДГЕЗИЯ',
        'Условия / виды работ', 'Адгезия стыков',
        'Типоразмер и пикеты', 'Адгезия стыка №12; №13',
        'Ответственный за производство работ', 'Павел 8(926)267-91-18',
        'Исх. №', '922'
      )),
      ('Геотрест', jsonb_build_object(
        'Вид вызова', 'КГС',
        'Коммуникация и объём', 'Газопровод 50 п.м.',
        'Точный адрес для вызова', 'Рождественская, д. 4',
        'Ответственный на объекте', 'Иванов Иван Иванович +7 999 999 99 99',
        'Пикеты (от – до)', 'ПК 4+00 – ПК 4+50'
      )),
      ('Технадзор', jsonb_build_object(
        'Пикеты (от – до)', 'ПК 2+00 – ПК 2+30',
        'Время вызова', '10-00',
        'Виды работ', 'монтаж',
        'Ответственный за производство работ', 'Павел 8(926)267-91-18'
      ))
    ) as t(type_name, payload)
  loop
    select id into tid from public.request_types
    where name = r.type_name and deleted_at is null
    limit 1;
    if tid is null then
      raise notice 'Пропуск: нет вида «%»', r.type_name;
      continue;
    end if;

    insert into public.requests(
      object_id, request_type_id, type_name,
      initiator_id, office_id, call_date, status, created_at
    )
    values (
      v_obj, tid, r.type_name,
      v_foreman, v_office, v_today + 1, 'ready', now() - interval '2 hours'
    )
    returning id, number into rid, v_no;

    insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by, updated_at)
    select
      rid,
      f.id,
      f.label,
      f.field_type,
      r.payload -> f.label,
      case when f.filled_by = 'office' then v_office else v_foreman end,
      now()
    from public.request_type_fields f
    where f.request_type_id = tid
      and f.deleted_at is null
      and r.payload ? f.label;

    raise notice 'Создана заявка №% «%» (ready)', v_no, r.type_name;
  end loop;
end $$;

select number, type_name, status, call_date
from public.requests
where deleted_at is null
  and created_at > now() - interval '10 minutes'
order by number desc;
