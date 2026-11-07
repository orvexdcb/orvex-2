-- ORVEX: secure feedback inbox and missing FK index
create table if not exists public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid null references public.shops(id) on delete set null,
  submitted_by uuid null references auth.users(id) on delete set null,
  request_type text not null check (request_type in ('suggestion','bug','support')),
  area text not null check (char_length(area) between 1 and 120),
  message text not null check (char_length(message) between 5 and 5000),
  contact_name text null check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text null check (contact_email is null or char_length(contact_email) <= 254),
  contact_phone text null check (contact_phone is null or char_length(contact_phone) <= 40),
  status text not null default 'new' check (status in ('new','in_progress','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_requests_created_at_idx
  on public.feedback_requests (created_at desc);
create index if not exists feedback_requests_shop_created_idx
  on public.feedback_requests (shop_id, created_at desc);

alter table public.feedback_requests enable row level security;

revoke all on table public.feedback_requests from anon, authenticated;
grant select on table public.feedback_requests to authenticated;
grant insert (
  shop_id, submitted_by, request_type, area, message,
  contact_name, contact_email, contact_phone, status
) on public.feedback_requests to authenticated;
grant update (status) on public.feedback_requests to authenticated;

drop policy if exists feedback_requests_founder_read on public.feedback_requests;
create policy feedback_requests_founder_read
  on public.feedback_requests
  for select to authenticated
  using (private.my_role() = 'founder');

drop policy if exists feedback_requests_scoped_insert on public.feedback_requests;
create policy feedback_requests_scoped_insert
  on public.feedback_requests
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and status = 'new'
    and private.my_device_ok()
    and (
      private.my_role() = 'founder'
      or (
        private.my_role() in ('manager','staff')
        and shop_id = private.my_shop()
        and private.my_shop_licensed()
      )
    )
  );

drop policy if exists feedback_requests_founder_status_update on public.feedback_requests;
create policy feedback_requests_founder_status_update
  on public.feedback_requests
  for update to authenticated
  using (private.my_role() = 'founder')
  with check (private.my_role() = 'founder');

create index if not exists complex_manager_shops_complex_id_idx
  on public.complex_manager_shops (complex_id);

notify pgrst, 'reload schema';
