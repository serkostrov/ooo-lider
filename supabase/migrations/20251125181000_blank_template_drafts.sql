-- Черновики шаблонов бланков: можно сохранить и доделать позже.
-- Черновики не предлагаются при выборе шаблона у вида заявки.

alter table public.request_blank_templates
  add column if not exists is_draft boolean not null default false;

comment on column public.request_blank_templates.is_draft is
  'true — черновик, не готов к привязке к видам заявок';

-- У черновика формат может быть ещё не выбран
alter table public.request_blank_templates
  alter column format drop not null;
