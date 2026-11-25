-- Тестовые логины по ролям. Пароль у всех: password123
-- Идемпотентно: если user уже есть — только привяжет / обновит профиль.

create extension if not exists pgcrypto;

do $$
declare
  r record;
  v_uid uuid;
  v_pid uuid;
begin
  for r in
    select * from (values
      ('admin@example.com',     '33333333-3333-4333-8333-333333333331'::uuid, 'admin',     'Администратор (тест)'),
      ('director@example.com',  '33333333-3333-4333-8333-333333333332'::uuid, 'director',  'Руководитель (тест)'),
      ('pto@example.com',       '33333333-3333-4333-8333-333333333333'::uuid, 'pto',       'Инженер ПТО (тест)'),
      ('foreman@example.com',   '33333333-3333-4333-8333-333333333334'::uuid, 'foreman',   'Прораб (тест)'),
      ('office@example.com',    '33333333-3333-4333-8333-333333333335'::uuid, 'office',    'Офис-менеджер (тест)'),
      ('supply@example.com',    '33333333-3333-4333-8333-333333333336'::uuid, 'supply',    'Снабжение (тест)'),
      ('estimator@example.com', '33333333-3333-4333-8333-333333333337'::uuid, 'estimator', 'Сметчик (тест)'),
      ('brigadier@example.com', '33333333-3333-4333-8333-333333333338'::uuid, 'brigadier', 'Бригадир (тест)')
    ) as t(email, uid, role_code, full_name)
  loop
    -- роль может отсутствовать (старый стенд)
    if not exists (select 1 from public.roles where code = r.role_code) then
      continue;
    end if;

    select id into v_uid from auth.users where email = r.email;
    if v_uid is null then
      v_uid := r.uid;
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_uid,
        'authenticated',
        'authenticated',
        r.email,
        crypt('password123', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        v_uid, v_uid,
        format('{"sub":"%s","email":"%s"}', v_uid, r.email)::jsonb,
        'email', v_uid::text, now(), now(), now()
      );
    else
      -- сбросить пароль на известный, чтобы можно было зайти
      update auth.users
      set encrypted_password = crypt('password123', gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = v_uid;
    end if;

    -- профиль: любой (в т.ч. soft-deleted), уже привязанный к этому auth.user
    select id into v_pid
    from public.profiles
    where user_id = v_uid
    order by (deleted_at is null) desc, created_at
    limit 1;

    if v_pid is not null then
      update public.profiles
      set deleted_at = null,
          is_active = true,
          role_code = r.role_code,
          email = r.email,
          full_name = coalesce(nullif(full_name, ''), r.full_name)
      where id = v_pid;
    else
      -- освободить user_id у чужих soft-deleted (иначе UNIQUE profiles_user_id_key)
      update public.profiles
      set user_id = null
      where user_id = v_uid
        and deleted_at is not null;

      select id into v_pid
      from public.profiles
      where role_code = r.role_code
        and user_id is null
        and deleted_at is null
      order by created_at
      limit 1;

      if v_pid is not null then
        update public.profiles
        set user_id = v_uid,
            email = r.email,
            full_name = coalesce(nullif(full_name, ''), r.full_name),
            is_active = true
        where id = v_pid;
      else
        insert into public.profiles(user_id, full_name, role_code, email, is_active)
        values (v_uid, r.full_name, r.role_code, r.email, true);
      end if;
    end if;
  end loop;
end $$;
