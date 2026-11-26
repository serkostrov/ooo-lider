-- Шаблоны сопроводительного письма (тема / текст) для вида заявки.
-- Плейсхолдеры: {{number}}, {{type}}, {{object}}, {{call_date}}.

alter table public.request_types
  add column if not exists email_title text,
  add column if not exists email_subtitle text;

comment on column public.request_types.email_title is
  'Тема письма при отправке бланка; плейсхолдеры {{number}} {{type}} {{object}} {{call_date}}';

comment on column public.request_types.email_subtitle is
  'Текст сопроводительного письма; те же плейсхолдеры';
