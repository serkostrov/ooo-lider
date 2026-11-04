-- =====================================================================
-- ООО «Лидер» · Версия 1 · Запуск после миграции и seed
-- Порядок: lider_v1_migration.sql → lider_v1_seed_spravochniki.sql → этот файл
-- Локально (supabase db reset): создаёт тестовых пользователей Auth, если их нет.
-- На облаке: если admin@example.com / foreman@example.com уже есть — привяжет профили.
-- =====================================================================

-- 1. Закрыть прямой вызов log_history (ТЗ 1.3: права — в БД).
revoke execute on function public.log_history(uuid, text, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- 2. Локальный bootstrap Auth (идемпотентно)
do $$
declare
  v_admin_id uuid := '11111111-1111-4111-8111-111111111111';
  v_foreman_id uuid := '22222222-2222-4222-8222-222222222222';
begin
  -- admin@example.com / пароль: password123
  if not exists (select 1 from auth.users where email = 'admin@example.com') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      'admin@example.com',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      v_admin_id, v_admin_id,
      format('{"sub":"%s","email":"admin@example.com"}', v_admin_id)::jsonb,
      'email', v_admin_id::text, now(), now(), now()
    );
  end if;

  -- foreman@example.com / пароль: password123
  if not exists (select 1 from auth.users where email = 'foreman@example.com') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_foreman_id,
      'authenticated',
      'authenticated',
      'foreman@example.com',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      v_foreman_id, v_foreman_id,
      format('{"sub":"%s","email":"foreman@example.com"}', v_foreman_id)::jsonb,
      'email', v_foreman_id::text, now(), now(), now()
    );
  end if;
end $$;

-- 3. Сотрудники с логином
insert into public.profiles(user_id, full_name, role_code, email)
select id, 'Администратор', 'admin', email
from auth.users where email = 'admin@example.com'
  and not exists (
    select 1 from public.profiles p where p.user_id = auth.users.id and p.deleted_at is null
  );

insert into public.profiles(user_id, full_name, role_code, email)
select id, 'Прораб (тест)', 'foreman', email
from auth.users where email = 'foreman@example.com'
  and not exists (
    select 1 from public.profiles p where p.user_id = auth.users.id and p.deleted_at is null
  );

-- 4. Сотрудники без логина (ТЗ 9)
insert into public.profiles(full_name, role_code)
select v.n, v.r
from (values
  ('Муслим',            'director'),
  ('Галина Ивановна',   'pto'),
  ('Милана',            'office'),
  ('Снабжение (тест)',  'supply')
) as v(n, r)
where not exists (
  select 1 from public.profiles p where p.full_name = v.n and p.deleted_at is null
);

-- 5. Заказчики с контактами (ТЗ 9)
insert into public.customers(name)
select 'АО «МОСГАЗ»'
where not exists (select 1 from public.customers where name = 'АО «МОСГАЗ»' and deleted_at is null);

insert into public.customer_contacts(customer_id, full_name, position, sort)
select c.id, v.full_name, v.position, v.sort
from public.customers c
cross join (values
  ('Контакт 1 (тест)', 'Куратор объекта', 1),
  ('Контакт 2 (тест)', 'Технадзор', 2)
) as v(full_name, position, sort)
where c.name = 'АО «МОСГАЗ»' and c.deleted_at is null
  and not exists (
    select 1 from public.customer_contacts cc
    where cc.customer_id = c.id and cc.full_name = v.full_name and cc.deleted_at is null
  );

insert into public.customers(name)
select 'Тестовый заказчик'
where not exists (select 1 from public.customers where name = 'Тестовый заказчик' and deleted_at is null);

insert into public.customer_contacts(customer_id, full_name, position, sort)
select c.id, 'Контакт (тест)', 'Представитель', 1
from public.customers c
where c.name = 'Тестовый заказчик' and c.deleted_at is null
  and not exists (
    select 1 from public.customer_contacts cc
    where cc.customer_id = c.id and cc.full_name = 'Контакт (тест)' and cc.deleted_at is null
  );

-- 6. Проверка
select
  (select count(*) from public.profiles where role_code = 'admin'   and user_id is not null) as admin_ok,
  (select count(*) from public.profiles where role_code = 'foreman' and user_id is not null) as foreman_ok,
  (select count(*) from public.stage_templates)  as stages,
  (select count(*) from public.documents)        as documents,
  (select count(*) from public.request_types)    as request_types,
  (select count(*) from storage.buckets where id = 'lider-files') as bucket;
