-- Полный текст сообщения Геотрест в исходящем реестра (как в бланке Max).

create or replace function public.registry_out_content_from_request(p_request_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.requests;
  v_draft jsonb;
  v_kind text;
  v_g jsonb;
  v_msg text;
  v_call text;
  v_object text;
  v_volume text;
  v_address text;
  v_resp text;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null;
  if not found then return null; end if;
  v_draft := r.doc_draft;
  if v_draft is null then
    return format('Заявка №%s «%s»', r.number, r.type_name);
  end if;
  v_kind := coalesce(v_draft->>'template', '');
  if v_kind = 'geotrest_message' then
    v_g := v_draft->'geotrest';
    v_msg := nullif(trim(coalesce(v_g->>'messageOverride', '')), '');
    if v_msg is not null then
      return v_msg;
    end if;
    v_call := nullif(trim(coalesce(v_g->>'callLine', '')), '');
    v_object := nullif(trim(coalesce(v_g->>'objectLine', '')), '');
    v_volume := nullif(trim(coalesce(v_g->>'volume', '')), '');
    v_address := nullif(trim(coalesce(v_g->>'address', '')), '');
    v_resp := nullif(trim(coalesce(v_g->>'responsible', '')), '');
    if v_call is not null or v_object is not null or v_volume is not null then
      return concat_ws(E'\n',
        format('1. Дата, на которую нужно вызвать (направлять за 2 дня до вызова): %s', coalesce(v_call, '')),
        format('2. Шифр и полное наименование объекта: %s', coalesce(v_object, '')),
        format('3. Коммуникация и объем (который нужно отснять): %s', coalesce(v_volume, '')),
        format('4. Точный адрес для вызова: %s', coalesce(v_address, '')),
        format('5. Ответственный на объекте и его номер: %s', coalesce(v_resp, ''))
      );
    end if;
  end if;
  return format('Заявка №%s «%s»', r.number, r.type_name);
end $$;
