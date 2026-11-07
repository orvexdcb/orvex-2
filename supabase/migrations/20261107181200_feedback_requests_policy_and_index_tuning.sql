-- ORVEX: index feedback requester FK and avoid per-row auth function evaluation
create index if not exists feedback_requests_submitted_by_idx
  on public.feedback_requests (submitted_by);

drop policy if exists feedback_requests_founder_read on public.feedback_requests;
create policy feedback_requests_founder_read
  on public.feedback_requests
  for select to authenticated
  using ((select private.my_role()) = 'founder');

drop policy if exists feedback_requests_scoped_insert on public.feedback_requests;
create policy feedback_requests_scoped_insert
  on public.feedback_requests
  for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and status = 'new'
    and (select private.my_device_ok())
    and (
      (select private.my_role()) = 'founder'
      or (
        (select private.my_role()) in ('manager','staff')
        and shop_id = (select private.my_shop())
        and (select private.my_shop_licensed())
      )
    )
  );

drop policy if exists feedback_requests_founder_status_update on public.feedback_requests;
create policy feedback_requests_founder_status_update
  on public.feedback_requests
  for update to authenticated
  using ((select private.my_role()) = 'founder')
  with check ((select private.my_role()) = 'founder');
