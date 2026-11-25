-- Нормализация разделителей между несколькими телефонами: пробел → «; ».

create or replace function public._normalize_multi_contacts(s text)
returns text
language plpgsql
immutable
as $$
declare
  prepared text;
  parts text[];
  p text;
  out text := '';
begin
  if s is null or btrim(s) = '' then
    return null;
  end if;
  prepared := replace(s, E'\r\n', E'\n');
  prepared := regexp_replace(prepared, '\s+(?=(\+7|8)\s*\()', '; ', 'g');
  prepared := regexp_replace(prepared, '\s+(?=(\+7|8)\d)', '; ', 'g');
  parts := regexp_split_to_array(prepared, '[;\n,]+');
  foreach p in array parts loop
    p := btrim(regexp_replace(p, '\s+', ' ', 'g'));
    if p <> '' then
      if out = '' then
        out := p;
      else
        out := out || '; ' || p;
      end if;
    end if;
  end loop;
  if out = '' then
    return null;
  end if;
  return out;
end;
$$;

update public.external_contacts
set phone = public._normalize_multi_contacts(phone)
where deleted_at is null
  and phone is not null
  and phone is distinct from public._normalize_multi_contacts(phone);

update public.external_contacts
set email = public._normalize_multi_contacts(email)
where deleted_at is null
  and email is not null
  and email is distinct from public._normalize_multi_contacts(email);

update public.customer_contacts
set phone = public._normalize_multi_contacts(phone)
where deleted_at is null
  and phone is not null
  and phone is distinct from public._normalize_multi_contacts(phone);

update public.customer_contacts
set email = public._normalize_multi_contacts(email)
where deleted_at is null
  and email is not null
  and email is distinct from public._normalize_multi_contacts(email);

drop function public._normalize_multi_contacts(text);
