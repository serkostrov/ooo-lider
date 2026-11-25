-- =============================================================================
-- Очистить ВСЕ заявки (список /requests станет пустым)
-- Скопируй в Supabase → SQL Editor (проект прод/стенд) → Run
-- Справочники, объекты, этапы, логины — НЕ трогает.
-- =============================================================================

do $$ begin perform set_config('lider.rpc', 'on', true); end $$;

-- --- Вариант A (рекомендуется): мягкое удаление ---
update public.requests
set
  deleted_at = now(),
  delete_reason = coalesce(delete_reason, 'Очистка всех заявок')
where deleted_at is null;

select count(*) as remaining_visible
from public.requests
where deleted_at is null;

-- --- Вернуть заявки обратно (если передумал) ---
-- update public.requests
-- set deleted_at = null, delete_reason = null
-- where delete_reason = 'Очистка всех заявок';

-- --- Вариант B: жёсткое удаление (безвозвратно) ---
-- Раскомментируй, если нужно стереть данные насовсем:
--
-- delete from public.request_comments;
-- delete from public.request_field_values;
-- delete from public.files
--  where entity_type in ('request', 'request_field');
-- delete from public.requests;
-- alter sequence public.requests_number_seq restart with 1;
