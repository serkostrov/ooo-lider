-- =====================================================================
-- ООО «Лидер» · Версия 1 · Исправления к миграции
-- Выполнить один раз после 01_after_migration.sql (Supabase → SQL Editor).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Исправление tg_guard_status()
-- В исходной версии одно условие обращается и к new.status_code (есть только
-- у object_stages), и к new.status (есть только у requests). PL/pgSQL
-- вычисляет обе ссылки, и любой UPDATE этапа или заявки вне RPC падал с
-- ошибкой «record "new" has no field ...»: не сохранялись примечание и поля
-- этапа, не работали stage_set_excluded(), request_set_call_date() и
-- автоназначение исполнителя в add_object_stages(). Логика та же: статус
-- меняется только через RPC.
-- ---------------------------------------------------------------------
create or replace function public.tg_guard_status() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('lider.rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_table_name = 'object_stages' then
    if new.status_code is distinct from old.status_code then
      raise exception 'Статус этапа меняется только через stage_set_status()';
    end if;
  elsif tg_table_name = 'requests' then
    if new.status is distinct from old.status then
      raise exception 'Статус заявки меняется только через request_set_status()';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Запись загрузки файлов в историю
-- ТЗ 11 — «Каждое действие (статус, условие, шаг, файл, перенос) появляется
-- в истории этапа или заявки». Файл загружается напрямую в storage и таблицу
-- files, поэтому запись в history делает триггер.
-- ---------------------------------------------------------------------
create or replace function public.tg_files_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_entity_type text;
  v_entity_id   uuid;
  v_where       text;
  v_kind        text := case new.kind
                          when 'draft'  then 'черновик на согласование'
                          when 'signed' then 'подписанный скан'
                          when 'photo'  then 'фото'
                          else 'файл' end;
  r record;
begin
  if new.entity_type = 'stage' then
    select id, number into r from public.object_stages where id = new.entity_id;
    v_entity_type := 'stage'; v_entity_id := r.id;
    v_where := format('Этап %s', r.number);
  elsif new.entity_type = 'stage_condition' then
    select s.id, s.number, c.title into r
    from public.object_stage_conditions c join public.object_stages s on s.id = c.stage_id
    where c.id = new.entity_id;
    v_entity_type := 'stage'; v_entity_id := r.id;
    v_where := format('Этап %s, условие «%s»', r.number, r.title);
  else
    -- request и request_field: entity_id — id заявки
    select id, number into r from public.requests where id = new.entity_id;
    v_entity_type := 'request'; v_entity_id := r.id;
    v_where := format('Заявка №%s', r.number);
  end if;

  perform public.log_history(new.object_id, v_entity_type, v_entity_id, 'file_uploaded',
    format('%s: загружен %s «%s»', v_where, v_kind, new.file_name),
    jsonb_build_object('file_id', new.id, 'kind', new.kind));
  return new;
end $$;

drop trigger if exists files_history on public.files;
create trigger files_history after insert on public.files
  for each row execute function public.tg_files_history();

-- Проверка: ожидаем trigger_ok = 1, guard_fixed = true
select
  (select count(*) from pg_trigger where tgname = 'files_history') as trigger_ok,
  (select prosrc like '%elsif tg_table_name = ''requests'' then%' from pg_proc where proname = 'tg_guard_status') as guard_fixed;
