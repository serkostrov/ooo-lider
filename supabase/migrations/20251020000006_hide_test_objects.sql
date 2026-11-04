-- =====================================================================
-- ООО «Лидер» · Необязательно: скрыть тестовые объекты «ТЕСТ · …» перед показом
-- Удаление мягкое (deleted_at), как везде в системе: данные остаются в базе.
-- Скрываются объект, его этапы и заявки — иначе заявки остались бы в общем
-- списке и счётчиках (v_requests не проверяет, удалён ли объект).
-- Вернуть всё обратно — блок «Отмена» в конце файла.
-- =====================================================================

update public.requests r set deleted_at = now(), delete_reason = 'Тестовые данные скрыты перед показом'
from public.objects o
where r.object_id = o.id and o.name like 'ТЕСТ%' and o.deleted_at is null and r.deleted_at is null;

update public.object_stages s set deleted_at = now()
from public.objects o
where s.object_id = o.id and o.name like 'ТЕСТ%' and o.deleted_at is null and s.deleted_at is null;

update public.objects set deleted_at = now()
where name like 'ТЕСТ%' and deleted_at is null;

-- Проверка: должно быть 0 видимых тестовых объектов и заявок
select
  (select count(*) from public.objects where name like 'ТЕСТ%' and deleted_at is null) as test_objects_visible,
  (select count(*) from public.v_requests where object_name like 'ТЕСТ%') as test_requests_visible;

-- ---------------------------------------------------------------------
-- Отмена (выполнить отдельно, если тестовые объекты нужно вернуть):
-- update public.objects set deleted_at = null where name like 'ТЕСТ%';
-- update public.object_stages s set deleted_at = null from public.objects o
--   where s.object_id = o.id and o.name like 'ТЕСТ%';
-- update public.requests r set deleted_at = null, delete_reason = null from public.objects o
--   where r.object_id = o.id and o.name like 'ТЕСТ%' and r.delete_reason = 'Тестовые данные скрыты перед показом';
-- ---------------------------------------------------------------------
