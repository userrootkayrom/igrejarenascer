create extension if not exists "pgcrypto";

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'admin' check (role in ('superadmin', 'admin')),
  permissions jsonb not null default '{}'::jsonb,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  data jsonb not null default '{}'::jsonb,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  data jsonb not null default '{}'::jsonb,
  event_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbox_submissions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  collection_name text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  leader_id uuid references public.members(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ministry_members (
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  role text,
  joined_at date,
  primary key (ministry_id, member_id)
);

create table if not exists public.cells (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  meeting_day text,
  meeting_time time,
  leader_id uuid references public.members(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cell_members (
  cell_id uuid not null references public.cells(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  role text,
  joined_at date,
  primary key (cell_id, member_id)
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  ministry_id uuid references public.ministries(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_assignments (
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  assignment text not null,
  response text not null default 'pending' check (response in ('pending', 'accepted', 'declined', 'replacement_requested')),
  responded_at timestamptz,
  primary key (schedule_id, member_id, assignment)
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  cell_id uuid references public.cells(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  checkin_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  source text not null default 'admin' check (source in ('admin', 'qr')),
  primary key (session_id, member_id)
);

create table if not exists public.pastoral_followups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'archived')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references auth.users(id) on delete set null,
  next_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.finance_categories(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  kind text not null check (kind in ('income', 'expense')),
  occurred_on date not null default current_date,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  inventory_code text unique,
  location text,
  condition text not null default 'good' check (condition in ('new', 'good', 'maintenance', 'retired')),
  acquired_on date,
  value numeric(12,2) check (value >= 0),
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  due_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'system',
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('whatsapp', 'google_calendar', 'microsoft_calendar', 'email')),
  label text not null,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_profiles where id = auth.uid()); $$;

create or replace function public.has_permission(permission_name text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(
  (select role = 'superadmin' or coalesce((permissions ->> permission_name)::boolean, false)
   from public.admin_profiles where id = auth.uid()), false); $$;

alter table public.admin_profiles enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.inbox_submissions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ministries enable row level security;
alter table public.ministry_members enable row level security;
alter table public.cells enable row level security;
alter table public.cell_members enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.pastoral_followups enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.assets enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.integration_connections enable row level security;

drop policy if exists "admins read own profile" on public.admin_profiles;
create policy "admins read own profile" on public.admin_profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('users'));
drop policy if exists "admins update own profile" on public.admin_profiles;
create policy "admins update own profile" on public.admin_profiles for update to authenticated
  using (id = auth.uid());

drop policy if exists "permitted members access" on public.members;
create policy "permitted members access" on public.members for all to authenticated
  using (public.has_permission('membros')) with check (public.has_permission('membros'));
drop policy if exists "permitted events access" on public.events;
create policy "permitted events access" on public.events for all to authenticated
  using (public.has_permission('eventos')) with check (public.has_permission('eventos'));
drop policy if exists "permitted inbox access" on public.inbox_submissions;
create policy "permitted inbox access" on public.inbox_submissions for all to authenticated
  using (public.has_permission('respostas')) with check (public.has_permission('respostas'));
drop policy if exists "permitted audit access" on public.audit_logs;
create policy "permitted audit access" on public.audit_logs for select to authenticated
  using (public.has_permission('auditoria'));

do $$
declare
  item record;
begin
  for item in select * from (values
    ('ministries', 'ministerios'), ('ministry_members', 'ministerios'),
    ('cells', 'celulas'), ('cell_members', 'celulas'),
    ('schedules', 'escalas'), ('schedule_assignments', 'escalas'),
    ('attendance_sessions', 'presenca'), ('attendance_records', 'presenca'),
    ('pastoral_followups', 'pastoral')
  ) as permissions(table_name, permission_name) loop
    execute format('drop policy if exists "phase two access" on public.%I', item.table_name);
    execute format(
      'create policy "phase two access" on public.%I for all to authenticated using (
        public.has_permission(''fase2'') or public.has_permission(''%s'')
      ) with check (
        public.has_permission(''fase2'') or public.has_permission(''%s'')
      )',
      item.table_name, item.permission_name, item.permission_name
    );
  end loop;
end $$;

do $$
declare
  item record;
begin
  for item in select * from (values
    ('finance_categories', 'financeiro'), ('finance_transactions', 'financeiro'),
    ('assets', 'patrimonio'), ('maintenance_requests', 'patrimonio'),
    ('notifications', 'notificacoes'), ('integration_connections', 'integracoes')
  ) as permissions(table_name, permission_name) loop
    execute format('drop policy if exists "phase three access" on public.%I', item.table_name);
    execute format(
      'create policy "phase three access" on public.%I for all to authenticated using (
        public.has_permission(''fase3'') or public.has_permission(''%s'')
      ) with check (
        public.has_permission(''fase3'') or public.has_permission(''%s'')
      )',
      item.table_name, item.permission_name, item.permission_name
    );
  end loop;
end $$;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select to authenticated
  using (recipient_id = auth.uid() or public.has_permission('notificacoes'));

create or replace view public.admin_overview_report as
select
  (select count(*) from public.members where status is distinct from 'Inativo') as active_members,
  (select count(*) from public.events where event_date >= now()) as upcoming_events,
  (select count(*) from public.pastoral_followups where status in ('open', 'in_progress')) as open_followups,
  (select count(*) from public.attendance_records where checked_in_at >= now() - interval '30 days') as attendance_last_30_days,
  (select coalesce(sum(amount) filter (where kind = 'income' and status = 'confirmed'), 0) from public.finance_transactions where occurred_on >= date_trunc('month', current_date)) as month_income,
  (select coalesce(sum(amount) filter (where kind = 'expense' and status = 'confirmed'), 0) from public.finance_transactions where occurred_on >= date_trunc('month', current_date)) as month_expenses;

create index if not exists members_status_idx on public.members(status);
create index if not exists events_date_idx on public.events(event_date);
create index if not exists inbox_collection_idx on public.inbox_submissions(collection_name);
create index if not exists audit_actor_created_idx on public.audit_logs(actor_id, created_at desc);
create index if not exists ministries_active_idx on public.ministries(active);
create index if not exists cells_active_idx on public.cells(active);
create index if not exists schedules_starts_idx on public.schedules(starts_at);
create index if not exists attendance_sessions_starts_idx on public.attendance_sessions(starts_at);
create index if not exists pastoral_followups_status_idx on public.pastoral_followups(status, next_contact_at);
create index if not exists finance_transactions_date_idx on public.finance_transactions(occurred_on desc);
create index if not exists maintenance_requests_status_idx on public.maintenance_requests(status, due_on);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, read_at);
