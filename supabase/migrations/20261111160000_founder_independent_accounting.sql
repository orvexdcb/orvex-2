-- ORVEX: independent founder ledger + read-only consolidated shop dashboard
-- Applied to Supabase project dgoimemvaudwayelcrmg on 2026-11-11.
create table if not exists public.acct_founder_accounts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete restrict,
 code text not null, name text not null, type text not null check(type in ('asset','liability','equity','revenue','expense')),
 is_active boolean not null default true, created_at timestamptz not null default now(), unique(owner_id,code));
create table if not exists public.acct_founder_entries (
 owner_id uuid not null references auth.users(id) on delete restrict, id text not null, entry_date date not null,
 memo text not null default '', created_by text not null default '', created_at timestamptz not null default now(), primary key(owner_id,id));
create table if not exists public.acct_founder_lines (
 owner_id uuid not null, entry_id text not null, line_no integer not null,
 account_id uuid not null references public.acct_founder_accounts(id) on delete restrict,
 debit numeric(18,2) not null default 0 check(debit>=0), credit numeric(18,2) not null default 0 check(credit>=0),
 primary key(owner_id,entry_id,line_no),
 foreign key(owner_id,entry_id) references public.acct_founder_entries(owner_id,id) on delete restrict,
 check((debit=0) <> (credit=0)));
create table if not exists public.acct_founder_periods (
 owner_id uuid primary key references auth.users(id) on delete restrict, locked_until date, updated_at timestamptz not null default now());
alter table public.acct_founder_accounts enable row level security;
alter table public.acct_founder_entries enable row level security;
alter table public.acct_founder_lines enable row level security;
alter table public.acct_founder_periods enable row level security;
drop policy if exists acct_founder_accounts_read on public.acct_founder_accounts;
create policy acct_founder_accounts_read on public.acct_founder_accounts for select to authenticated using(owner_id=(select auth.uid()) and private.my_role()='founder' and private.my_device_ok());
drop policy if exists acct_founder_entries_read on public.acct_founder_entries;
create policy acct_founder_entries_read on public.acct_founder_entries for select to authenticated using(owner_id=(select auth.uid()) and private.my_role()='founder' and private.my_device_ok());
drop policy if exists acct_founder_lines_read on public.acct_founder_lines;
create policy acct_founder_lines_read on public.acct_founder_lines for select to authenticated using(owner_id=(select auth.uid()) and private.my_role()='founder' and private.my_device_ok());
drop policy if exists acct_founder_periods_read on public.acct_founder_periods;
create policy acct_founder_periods_read on public.acct_founder_periods for select to authenticated using(owner_id=(select auth.uid()) and private.my_role()='founder' and private.my_device_ok());
grant select on public.acct_founder_accounts,public.acct_founder_entries,public.acct_founder_lines,public.acct_founder_periods to authenticated;
create or replace function private.acct_founder_assert() returns uuid language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin
 if uid is null or private.my_role() is distinct from 'founder' or not private.my_device_ok() then raise exception 'ORVEX_FORBIDDEN: founder accounting only'; end if; return uid;
end $$;
revoke all on function private.acct_founder_assert() from public,anon;
grant execute on function private.acct_founder_assert() to authenticated;
create or replace function public.acct_founder_seed() returns integer language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.acct_founder_assert(); n integer; begin
 insert into public.acct_founder_accounts(owner_id,code,name,type) values
 (uid,'1110','الصندوق','asset'),(uid,'1120','البنك','asset'),(uid,'1130','ذمم مدينة','asset'),
 (uid,'2110','ذمم دائنة','liability'),(uid,'3100','رأس المال','equity'),(uid,'3200','الأرباح المحتجزة','equity'),
 (uid,'4100','إيرادات أخرى','revenue'),(uid,'5100','مصروفات تشغيلية','expense') on conflict(owner_id,code) do nothing;
 get diagnostics n=row_count; return n; end $$;
create or replace function public.acct_founder_add_account(p_code text,p_name text,p_type text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.acct_founder_assert(); nid uuid; begin
 if p_type not in ('asset','liability','equity','revenue','expense') or btrim(coalesce(p_code,''))='' or btrim(coalesce(p_name,''))='' then raise exception 'ORVEX_BAD_ACCOUNT'; end if;
 insert into public.acct_founder_accounts(owner_id,code,name,type) values(uid,btrim(p_code),btrim(p_name),p_type) returning id into nid; return nid; end $$;
create or replace function public.acct_founder_trial_balance(p_from date,p_to date)
returns table(id uuid,code text,name text,type text,debit numeric,credit numeric,balance numeric)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.acct_founder_assert(); begin
 return query select a.id,a.code,a.name,a.type,coalesce(sum(l.debit),0)::numeric,coalesce(sum(l.credit),0)::numeric,
 (case when a.type in ('asset','expense') then coalesce(sum(l.debit-l.credit),0) else coalesce(sum(l.credit-l.debit),0) end)::numeric
 from public.acct_founder_accounts a left join (
 select ln.* from public.acct_founder_lines ln join public.acct_founder_entries en on en.owner_id=ln.owner_id and en.id=ln.entry_id
 where ln.owner_id=uid and en.entry_date between p_from and p_to) l on l.account_id=a.id
 where a.owner_id=uid and a.is_active group by a.id,a.code,a.name,a.type order by a.code; end $$;
create or replace function public.acct_founder_post(p_entry jsonb) returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.acct_founder_assert(); eid text:=p_entry->>'id'; edate date; lockdate date; ln jsonb; i int:=0; d numeric:=0; c numeric:=0; begin
 edate:=(p_entry->>'entry_date')::date;
 if eid is null or edate is null or jsonb_typeof(p_entry->'lines') is distinct from 'array' or jsonb_array_length(p_entry->'lines')<2 then raise exception 'ORVEX_BAD_ENTRY'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':founder-je:'||eid,0));
 if exists(select 1 from public.acct_founder_entries where owner_id=uid and id=eid) then return 'duplicate'; end if;
 select locked_until into lockdate from public.acct_founder_periods where owner_id=uid;
 if lockdate is not null and edate<=lockdate then raise exception 'ORVEX_PERIOD_CLOSED'; end if;
 for ln in select * from jsonb_array_elements(p_entry->'lines') loop
  if not exists(select 1 from public.acct_founder_accounts a where a.id=(ln->>'account_id')::uuid and a.owner_id=uid and a.is_active) then raise exception 'ORVEX_BAD_ACCOUNT'; end if;
  d:=d+coalesce((ln->>'debit')::numeric,0); c:=c+coalesce((ln->>'credit')::numeric,0); i:=i+1;
  if coalesce((ln->>'debit')::numeric,0)<0 or coalesce((ln->>'credit')::numeric,0)<0 or ((coalesce((ln->>'debit')::numeric,0)>0)=(coalesce((ln->>'credit')::numeric,0)>0)) then raise exception 'ORVEX_BAD_LINE'; end if;
 end loop;
 if i<2 or d<=0 or d<>c then raise exception 'ORVEX_UNBALANCED'; end if;
 insert into public.acct_founder_entries(owner_id,id,entry_date,memo,created_by) values(uid,eid,edate,coalesce(p_entry->>'memo',''),coalesce(p_entry->>'created_by',''));
 i:=0; for ln in select * from jsonb_array_elements(p_entry->'lines') loop i:=i+1;
 insert into public.acct_founder_lines(owner_id,entry_id,line_no,account_id,debit,credit) values(uid,eid,i,(ln->>'account_id')::uuid,coalesce((ln->>'debit')::numeric,0),coalesce((ln->>'credit')::numeric,0)); end loop; return 'posted'; end $$;
create or replace function public.acct_founder_lock(p_until date) returns date language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.acct_founder_assert(); cur date; begin
 select locked_until into cur from public.acct_founder_periods where owner_id=uid;
 if cur is not null and p_until<cur then raise exception 'ORVEX_PERIOD_CLOSED'; end if;
 insert into public.acct_founder_periods(owner_id,locked_until) values(uid,p_until)
 on conflict(owner_id) do update set locked_until=excluded.locked_until,updated_at=now(); return p_until; end $$;
drop function if exists public.acct_founder_group_dashboard();
create function public.acct_founder_group_dashboard()
returns table(shop_id uuid,shop_name text,entries bigint,debit numeric,credit numeric,assets numeric,liabilities numeric,revenue numeric,expenses numeric,net_profit numeric)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.my_role() is distinct from 'founder' or not private.my_device_ok() then raise exception 'ORVEX_FORBIDDEN'; end if;
 return query select s.id,s.name,count(distinct e.id)::bigint,coalesce(sum(l.debit),0)::numeric,coalesce(sum(l.credit),0)::numeric,
 coalesce(sum(case when a.type='asset' then l.debit-l.credit else 0 end),0)::numeric,
 coalesce(sum(case when a.type='liability' then l.credit-l.debit else 0 end),0)::numeric,
 coalesce(sum(case when a.type='revenue' then l.credit-l.debit else 0 end),0)::numeric,
 coalesce(sum(case when a.type='expense' then l.debit-l.credit else 0 end),0)::numeric,
 coalesce(sum(case when a.type='revenue' then l.credit-l.debit when a.type='expense' then l.credit-l.debit else 0 end),0)::numeric
 from public.shops s left join public.acct_entries e on e.shop_id=s.id
 left join public.acct_lines l on l.shop_id=e.shop_id and l.entry_id=e.id
 left join public.acct_accounts a on a.shop_id=l.shop_id and a.id=l.account_id
 group by s.id,s.name order by s.name;
end $$;
-- Prevent founder role from reading or writing individual shop ledgers; dashboard RPC is read-only.
create or replace function private.acct_assert_access(p_shop uuid) returns void language plpgsql stable set search_path='' as $$
begin
 if not private.my_device_ok() then raise exception 'ORVEX_FORBIDDEN: الجهاز غير مفعّل'; end if;
 if private.my_role() is distinct from 'manager' or p_shop is distinct from private.my_shop() or not private.my_shop_licensed() then raise exception 'ORVEX_FORBIDDEN: دفتر المحل متاح لمديره فقط'; end if;
end $$;
drop policy if exists acct_accounts_read on public.acct_accounts;
create policy acct_accounts_read on public.acct_accounts for select to authenticated using(shop_id=(select private.my_shop()) and (select private.my_role())='manager' and (select private.my_shop_licensed()));
drop policy if exists acct_entries_read on public.acct_entries;
create policy acct_entries_read on public.acct_entries for select to authenticated using(shop_id=(select private.my_shop()) and (select private.my_role())='manager' and (select private.my_shop_licensed()));
drop policy if exists acct_lines_read on public.acct_lines;
create policy acct_lines_read on public.acct_lines for select to authenticated using(shop_id=(select private.my_shop()) and (select private.my_role())='manager' and (select private.my_shop_licensed()));
drop policy if exists acct_periods_read on public.acct_periods;
create policy acct_periods_read on public.acct_periods for select to authenticated using(shop_id=(select private.my_shop()) and (select private.my_role())='manager' and (select private.my_shop_licensed()));
revoke all on function public.acct_founder_seed() from public,anon;
revoke all on function public.acct_founder_add_account(text,text,text) from public,anon;
revoke all on function public.acct_founder_trial_balance(date,date) from public,anon;
revoke all on function public.acct_founder_post(jsonb) from public,anon;
revoke all on function public.acct_founder_lock(date) from public,anon;
revoke all on function public.acct_founder_group_dashboard() from public,anon;
grant execute on function public.acct_founder_seed(),public.acct_founder_add_account(text,text,text),public.acct_founder_trial_balance(date,date),public.acct_founder_post(jsonb),public.acct_founder_lock(date),public.acct_founder_group_dashboard() to authenticated;
