create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username varchar(32) not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  domain varchar(32) not null unique,
  owner_id uuid not null references public.users(id) on delete cascade,
  target_url text,
  status varchar(20) not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  domain_id uuid references public.domains(id) on delete set null,
  title varchar(100) not null,
  description varchar(500) not null default '',
  keywords varchar(300) not null default '',
  category varchar(50) not null default 'Other',
  html text not null,
  css text not null default '',
  javascript text not null default '',
  status varchar(20) not null default 'published',
  views bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, site_id)
);

create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_username
on public.users(username);

create index if not exists idx_domains_domain
on public.domains(domain);

create index if not exists idx_domains_owner
on public.domains(owner_id);

create index if not exists idx_sites_owner
on public.sites(owner_id);

create index if not exists idx_sites_domain
on public.sites(domain_id);

create index if not exists idx_sites_status
on public.sites(status);

create index if not exists idx_sites_category
on public.sites(category);

create index if not exists idx_sites_views
on public.sites(views desc);

create index if not exists idx_bookmarks_user
on public.bookmarks(user_id);

create index if not exists idx_search_history_created
on public.search_history(created_at desc);

create or replace function public.increment_site_views(site_uuid uuid)
returns void
language sql
security definer
as $$
  update public.sites
  set views = views + 1
  where id = site_uuid;
$$;

alter table public.users enable row level security;
alter table public.domains enable row level security;
alter table public.sites enable row level security;
alter table public.bookmarks enable row level security;
alter table public.search_history enable row level security;

revoke all on public.users from anon, authenticated;
revoke all on public.domains from anon, authenticated;
revoke all on public.sites from anon, authenticated;
revoke all on public.bookmarks from anon, authenticated;
revoke all on public.search_history from anon, authenticated;

grant all on public.users to service_role;
grant all on public.domains to service_role;
grant all on public.sites to service_role;
grant all on public.bookmarks to service_role;
grant all on public.search_history to service_role;
