-- =====================================================================
-- Нормативы справочника этапов (duration / роли / ответ / напоминание)
-- Источник правды вне демо-скрипта 04 (созвон / ТЗ 3.4)
-- =====================================================================

update public.stage_templates st set
  duration_days  = coalesce(st.duration_days, n.dur),
  executor_role  = coalesce(st.executor_role, n.exec),
  confirmer_role = coalesce(st.confirmer_role, n.conf),
  response_days  = coalesce(st.response_days, case when st.expected_doc is not null then n.resp end),
  remind_days    = coalesce(st.remind_days, n.remind)
from public.work_types w
join (values
  ('Тендер и договор',              10, 'pto',     'director', 7,  3),
  ('Документация и согласования',   14, 'pto',     'director', 10, 3),
  ('Геодезия и съёмки',              5, 'foreman', 'pto',      5,  2),
  ('Земляные работы',               10, 'foreman', 'pto',      5,  2),
  ('Сварочно-монтажные работы',     12, 'foreman', 'pto',      5,  2),
  ('Испытания и просвет стыков',     5, 'foreman', 'pto',      5,  2),
  ('Химзащита (ЭХЗ)',                7, 'foreman', 'pto',      7,  2),
  ('Врезка и сдача',                 7, 'foreman', 'director', 7,  2),
  ('Благоустройство и озеленение',  14, 'foreman', 'director', 10, 3),
  ('Папка ИД и форма 6',            10, 'pto',     'director', 14, 3)
) as n(wt, dur, exec, conf, resp, remind) on n.wt = w.name
where st.work_type_id = w.id and st.deleted_at is null;
