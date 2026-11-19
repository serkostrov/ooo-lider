-- Ответ на сообщение в переписке заявки.

alter table public.request_comments
  add column if not exists parent_id uuid references public.request_comments(id) on delete set null;

create index if not exists request_comments_parent_idx
  on public.request_comments (parent_id)
  where parent_id is not null;
