-- Импорт общих контактов из «АДРЕСА.xlsx» в external_contacts
-- Идемпотентно: не дублируем по full_name + position (если уже есть и не удалён).

do $$
declare
  v_sort int;
begin
  select coalesce(max(sort), 0) into v_sort from public.external_contacts where deleted_at is null;

  -- 1. Вдовин Михаил Иванович
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Вдовин Михаил Иванович'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Генеральный директор Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Вдовин Михаил Иванович', 'Генеральный директор Мосгаз', null, null, null, true, v_sort);
  end if;

  -- 2. Свиридова Елена Владимировна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Свиридова Елена Владимировна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Главному инженеру проекта Мастерской №2 УРПСД Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Свиридова Елена Владимировна', 'Главному инженеру проекта Мастерской №2 УРПСД Мосгаз', '8(495)660-27-60 (42-43)', null, null, true, v_sort);
  end if;

  -- 3. Скорикова Ольга Анатольевна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Скорикова Ольга Анатольевна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Начальник УКС Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Скорикова Ольга Анатольевна', 'Начальник УКС Мосгаз', null, null, null, true, v_sort);
  end if;

  -- 4. Сафронов Станислав Александрович
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Сафронов Станислав Александрович'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Куратор объекта "Бараново" Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Сафронов Станислав Александрович', 'Куратор объекта "Бараново" Мосгаз', '8(926)396-03-99', 'safronovsa@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 5. Чистова Кабанова Анастасия
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Чистова Кабанова Анастасия'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Секретарь УКС Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Чистова Кабанова Анастасия', 'Секретарь УКС Мосгаз', '8(495)660-60-83 (20-13)', 's205@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 6. Торопцев
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Торопцев'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Начальниик УРИП Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Торопцев', 'Начальниик УРИП Мосгаз', null, 'toroptcevas@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 7. Ольга Мудрая Викторовна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Ольга Мудрая Викторовна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Секретарь УРИП Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Ольга Мудрая Викторовна', 'Секретарь УРИП Мосгаз', null, 'MudrayaOV@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 8. Хмелева Наталья Владимировна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Хмелева Наталья Владимировна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('ПТО УКС Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Хмелева Наталья Владимировна', 'ПТО УКС Мосгаз', '8(495)287-79-83 (22-14)', null, 'запрос РД', true, v_sort);
  end if;

  -- 9. Ермачкова Татьяна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Ермачкова Татьяна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Ведущий инженер ОПП УКС Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Ермачкова Татьяна', 'Ведущий инженер ОПП УКС Мосгаз', '8(985)443-43-38 8(495)660-29-77 (52-69)', 'ermachkovatg@mos-gaz.ru', 'ордер', true, v_sort);
  end if;

  -- 10. Чинаев
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Чинаев'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('инспектор по защите Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Чинаев', 'инспектор по защите Мосгаз', null, 'chinaevum@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 11. Созанская Елена
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Созанская Елена'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Зам. Начальник УКС Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Созанская Елена', 'Зам. Начальник УКС Мосгаз', '8(926)382-96-16 (22-47)', 'sozanskayea@mos-gaz.ru', 'ордер', true, v_sort);
  end if;

  -- 12. Кабанова Наталья Юрьевна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Кабанова Наталья Юрьевна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Инженер ПТО УТН Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Кабанова Наталья Юрьевна', 'Инженер ПТО УТН Мосгаз', '8(495)287-79-87 (20-53)', 'kabanovanu@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 13. Еремина Виктория Олеговна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Еремина Виктория Олеговна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Начальник УТН')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Еремина Виктория Олеговна', 'Начальник УТН', null, null, null, true, v_sort);
  end if;

  -- 14. Ракова Екатерина Сергеевна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Ракова Екатерина Сергеевна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim(null)), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Ракова Екатерина Сергеевна', null, null, 'rakovaes@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 15. Гусарова Олеся Викторовна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Гусарова Олеся Викторовна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim(null)), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Гусарова Олеся Викторовна', null, '8(495)287-96-44', null, 'рег. проекта РД Мосгаз технадзор', true, v_sort);
  end if;

  -- 16. Титова Наталья Владимировна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Титова Наталья Владимировна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim(null)), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Титова Наталья Владимировна', null, '8(499)267-90-16', null, null, true, v_sort);
  end if;

  -- 17. Семченко Наталья Вячеславна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Семченко Наталья Вячеславна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Зам. Начальник управления Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Семченко Наталья Вячеславна', 'Зам. Начальник управления Мосгаз', '8(499)263-07-58', null, 'технадзор', true, v_sort);
  end if;

  -- 18. Глаголева Нина Михайловна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Глаголева Нина Михайловна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Ведущий инженер ОПП УКС Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Глаголева Нина Михайловна', 'Ведущий инженер ОПП УКС Мосгаз', '8(925)328-08-41 8(495)916-59-00 (24-37)', null, 'порубочный талон', true, v_sort);
  end if;

  -- 19. Самсонова Оксана Сергеевна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Самсонова Оксана Сергеевна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Зам. Начальник лаборатории мех. Испытания')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Самсонова Оксана Сергеевна', 'Зам. Начальник лаборатории мех. Испытания', '8(499)218-13-58', null, null, true, v_sort);
  end if;

  -- 20. Татьяна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Татьяна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim(null)), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Татьяна', null, '8(910)674-41-89', null, 'спец. Сафронов', true, v_sort);
  end if;

  -- 21. Нестерова Елизавета
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Нестерова Елизавета'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('ИК ТЭС ПТО')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Нестерова Елизавета', 'ИК ТЭС ПТО', '8(999)772-91-60', 'e.nesterovovich@iktes.ru', null, true, v_sort);
  end if;

  -- 22. Елена Гончарова
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Елена Гончарова'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('ИК ТЭС')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Елена Гончарова', 'ИК ТЭС', '8(925)022-96-61', 'e.goncharova@iktes.ru', null, true, v_sort);
  end if;

  -- 23. Борсунов Алексей Анатольевич
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Борсунов Алексей Анатольевич'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Начальник Лаборатории мех. Испытаний')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Борсунов Алексей Анатольевич', 'Начальник Лаборатории мех. Испытаний', '8(499)213-13-68 8(916)792-18-57', null, null, true, v_sort);
  end if;

  -- 24. Андреев Максим Юрьевич
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Андреев Максим Юрьевич'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Технадзор спец. ГСН')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Андреев Максим Юрьевич', 'Технадзор спец. ГСН', '8(985)894-62-64', null, null, true, v_sort);
  end if;

  -- 25. Васильев Константин Евгеньевич
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Васильев Константин Евгеньевич'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Технадзорспец. АЗ')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Васильев Константин Евгеньевич', 'Технадзорспец. АЗ', '8(916)996-92-93', null, null, true, v_sort);
  end if;

  -- 26. Гавриков Роман Андреевич
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Гавриков Роман Андреевич'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Геодезист ООО "ЛИДЕР"')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Гавриков Роман Андреевич', 'Геодезист ООО "ЛИДЕР"', '8(910)425-33-00', 'Roman-type-r@yandex.ru', null, true, v_sort);
  end if;

  -- 27. Спицина Анна Анатольевна
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Спицина Анна Анатольевна'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('ПТО Мастер Участка Мосгаз')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Спицина Анна Анатольевна', 'ПТО Мастер Участка Мосгаз', '8(926)258-39-95', 'SpicynaAA@mos-gaz.ru', 'увед. ГВСД и УЭГНД', true, v_sort);
  end if;

  -- 28. Александр
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Александр'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('ИНТЕГРАЛ Заявки')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Александр', 'ИНТЕГРАЛ Заявки', '8(915)119-07-07', null, null, true, v_sort);
  end if;

  -- 29. АО "МОСГАЗ"
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('АО "МОСГАЗ"'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('АО "МОСГАЗ"', 'Организация / служба', '8(800)700-71-04', 'info@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 30. ОДНО ОКНО АО "МОСГАЗ"
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('ОДНО ОКНО АО "МОСГАЗ"'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('ОДНО ОКНО АО "МОСГАЗ"', 'Организация / служба', '8(495)660-72-66', 'coo@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 31. Лаб. Мосгаз
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Лаб. Мосгаз'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Лаб. Мосгаз', 'Организация / служба', '8(499)267-62-89 8(499)263-11-00', 'platovdv@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 32. Лаб. Интеграл
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Лаб. Интеграл'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Лаб. Интеграл', 'Организация / служба', '8(495)987-18-00 8(499)263-11-00', 'integral22@list.ru', null, true, v_sort);
  end if;

  -- 33. Технадзор
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Технадзор'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Технадзор', 'Организация / служба', null, 'tehnadxor@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 34. Жилищник
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Жилищник'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Жилищник', 'Организация / служба', '8(499)652-65-33', 'ptin-zhilfilimonky@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 35. Префектура
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Префектура'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Префектура', 'Организация / служба', null, 'tinao@mos.ru', null, true, v_sort);
  end if;

  -- 36. Регистрация Журналов
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Регистрация Журналов'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Регистрация Журналов', 'Организация / служба', null, null, '2 эт. Мосгаз 211 каб. УКС', true, v_sort);
  end if;

  -- 37. Департамент природопользования
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Департамент природопользования'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Департамент природопользования', 'Организация / служба', null, 'depmospriroda@mos.ru', null, true, v_sort);
  end if;

  -- 38. Снабжение
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('Снабжение'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('Снабжение', 'Организация / служба', null, 'Zaletovmv@mos-gaz.ru; daevaaa@mos-gaz.ru; teplovodskayain@mos-gaz.ru; kulikovsv@mos-gaz.ru', null, true, v_sort);
  end if;

  -- 39. РОССЕТИ
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('РОССЕТИ'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('РОССЕТИ', 'Организация / служба', null, null, 'lk.rossetmr.ru', true, v_sort);
  end if;

  -- 40. МОСВОДОКАНАЛ
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('МОСВОДОКАНАЛ'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('МОСВОДОКАНАЛ', 'Организация / служба', null, null, 'ep.mosvodokanal.ru', true, v_sort);
  end if;

  -- 41. ГВСД ГРС УЭНГД
  if not exists (
    select 1 from public.external_contacts
    where deleted_at is null
      and lower(trim(full_name)) = lower(trim('ГВСД ГРС УЭНГД'))
      and coalesce(lower(trim(position)), '') = coalesce(lower(trim('Организация / служба')), '')
  ) then
    v_sort := v_sort + 1;
    insert into public.external_contacts(full_name, position, phone, email, comment, is_active, sort)
    values ('ГВСД ГРС УЭНГД', 'Организация / служба', null, 'info@mos-gaz.ru; chinaevum@mos-gaz.ru; tehnadzor@mos-gaz.ru', 'мосгаз,инспектор по защите,технадзор', true, v_sort);
  end if;

end $$;
