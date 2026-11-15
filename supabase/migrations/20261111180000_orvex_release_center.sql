-- ORVEX Update Center: additive control-plane schema only.
-- Does not alter existing shop, sales, inventory, accounting or customer data.
create table if not exists public.orvex_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  notes text not null default '',
  status text not null default 'draft'
    check (status in ('draft','testing','approved','published','paused','quarantined','rolled_back')),
  artifact_url text,
  artifact_sha256 text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz,
  paused_at timestamptz,
  quarantined_at timestamptz,
  rollback_from uuid references public.orvex_releases(id),
  rollback_to uuid references public.orvex_releases(id),
  failure_reason text,
  constraint orvex_release_version_semver check (version ~ '^[0-9]+[.][0-9]+[.][0-9]+(-[0-9A-Za-z.-]+)?([+][0-9A-Za-z.-]+)?$')
);
create table if not exists public.orvex_release_targets (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.orvex_releases(id) on delete cascade,
  target_type text not null check (target_type in ('all','shop','founder','institution','mall','group')),
  target_id text,
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  constraint orvex_release_target_shape check (
    (target_type = 'all' and target_id is null) or
    (target_type <> 'all' and target_id is not null)
  )
);
create unique index if not exists orvex_release_targets_unique
  on public.orvex_release_targets(release_id,target_type,coalesce(target_id,''),excluded);
create table if not exists public.orvex_release_events (
  id bigint generated always as identity primary key,
  release_id uuid references public.orvex_releases(id),
  actor_id uuid references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists orvex_release_events_monitor_idx
  on public.orvex_release_events(release_id,event_type,created_at desc,actor_id);
alter table public.orvex_releases enable row level security;
alter table public.orvex_release_targets enable row level security;
alter table public.orvex_release_events enable row level security;
revoke all on public.orvex_releases from anon, authenticated;
revoke all on public.orvex_release_targets from anon, authenticated;
revoke all on public.orvex_release_events from anon, authenticated;
grant all on public.orvex_releases to service_role;
grant all on public.orvex_release_targets to service_role;
grant all on public.orvex_release_events to service_role;
grant usage, select on sequence public.orvex_release_events_id_seq to service_role;
create or replace function public.orvex_release_events_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'ORVEX release event log is append-only';
end;
$$;
drop trigger if exists orvex_release_events_no_update on public.orvex_release_events;
create trigger orvex_release_events_no_update before update or delete
on public.orvex_release_events for each row execute function public.orvex_release_events_immutable();
revoke all on function public.orvex_release_events_immutable() from public, anon, authenticated;
grant execute on function public.orvex_release_events_immutable() to service_role;
