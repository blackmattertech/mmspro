-- QUERY NAME: 128-support-tickets — Support ticket system
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 127-uom-category.sql
-- Company support tickets, conversation, internal notes, and SLA policy.
-- Ticket numbers are global (MMS-SUP-0001). Writes go through the API
-- service role. Org members can read their own public ticket data.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.support_ticket_counters (
  id boolean primary key default true,
  next_number integer not null default 1,
  constraint support_ticket_counters_singleton check (id)
);

insert into public.support_ticket_counters (id, next_number)
values (true, 1)
on conflict (id) do nothing;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject text not null,
  description text not null,
  category text not null,
  priority text not null,
  status text not null default 'open',
  related_module text,
  asset_ref text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  assignee_name text,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  sla_due_at timestamptz not null,
  first_response_due_at timestamptz not null,
  sla_paused_at timestamptz,
  rating smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_number_key unique (ticket_number),
  constraint support_tickets_status_check check (
    status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')
  ),
  constraint support_tickets_priority_check check (
    priority in ('critical', 'high', 'medium', 'low')
  ),
  constraint support_tickets_subject_len check (char_length(btrim(subject)) between 3 and 160),
  constraint support_tickets_description_len check (char_length(btrim(description)) between 10 and 8000),
  constraint support_tickets_rating_check check (rating is null or rating between 1 and 5)
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  visibility text not null,
  author_profile_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_ticket_messages_visibility_check check (visibility in ('public', 'internal')),
  constraint support_ticket_messages_role_check check (author_role in ('customer', 'support')),
  constraint support_ticket_messages_body_len check (char_length(btrim(body)) between 1 and 8000)
);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint support_ticket_events_message_len check (char_length(btrim(message)) between 1 and 300)
);

create table if not exists public.support_sla_policies (
  priority text primary key,
  label text not null,
  level_label text not null,
  description text not null,
  first_response_minutes integer not null,
  resolution_minutes integer not null,
  operating_hours text not null,
  escalation_label text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint support_sla_policies_priority_check check (priority in ('critical', 'high', 'medium', 'low')),
  constraint support_sla_policies_minutes_check check (
    first_response_minutes between 5 and 10080
    and resolution_minutes between first_response_minutes and 43200
  )
);

create table if not exists public.support_sla_settings (
  id boolean primary key default true,
  pause_on_waiting boolean not null default true,
  auto_close_hours integer not null default 48,
  business_hours_label text not null default 'Mon – Fri (08:00 AM – 08:00 PM IST)',
  updated_at timestamptz not null default now(),
  constraint support_sla_settings_singleton check (id),
  constraint support_sla_settings_hours_check check (auto_close_hours between 1 and 720),
  constraint support_sla_settings_label_len check (char_length(btrim(business_hours_label)) between 3 and 120)
);

insert into public.support_sla_policies (
  priority, label, level_label, description,
  first_response_minutes, resolution_minutes, operating_hours, escalation_label
)
values
  ('critical', 'Critical', 'P1', 'Production outage, business stoppage, or data loss', 30, 240, '24x7', '75% of resolution time'),
  ('high', 'High', 'P2', 'Major module impairment with no workaround', 60, 480, '24x7', '80% of resolution time'),
  ('medium', 'Medium', 'P3', 'Minor defect with a workaround available', 240, 1440, 'Business hours', '90% of resolution time'),
  ('low', 'Low', 'P4', 'Cosmetic issue, question, or feature request', 480, 4320, 'Business hours', 'Routine review')
on conflict (priority) do nothing;

insert into public.support_sla_settings (id)
values (true)
on conflict (id) do nothing;

create index if not exists idx_support_tickets_org_status_updated
  on public.support_tickets (org_id, status, updated_at desc);

create index if not exists idx_support_tickets_status_due
  on public.support_tickets (status, sla_due_at);

create index if not exists idx_support_ticket_messages_ticket_created
  on public.support_ticket_messages (ticket_id, created_at);

create index if not exists idx_support_ticket_events_ticket_created
  on public.support_ticket_events (ticket_id, created_at);

create or replace function public.next_support_ticket_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  issued integer;
begin
  insert into public.support_ticket_counters as counters (id, next_number)
  values (true, 2)
  on conflict (id) do update
    set next_number = counters.next_number + 1
  returning next_number - 1 into issued;

  return 'MMS-SUP-' || lpad(issued::text, 4, '0');
end;
$$;

create or replace function public.support_ticket_summary(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*),
    'open', count(*) filter (where status = 'open'),
    'in_progress', count(*) filter (where status = 'in_progress'),
    'waiting_customer', count(*) filter (where status = 'waiting_customer'),
    'resolved', count(*) filter (where status = 'resolved'),
    'closed', count(*) filter (where status = 'closed'),
    'unassigned', count(*) filter (
      where assignee_name is null
        and status in ('open', 'in_progress', 'waiting_customer')
    ),
    'breached', count(*) filter (
      where status in ('open', 'in_progress')
        and sla_paused_at is null
        and sla_due_at < now()
    ),
    'sla_at_risk', count(*) filter (
      where status in ('open', 'in_progress')
        and sla_paused_at is null
        and sla_due_at >= now()
        and sla_due_at < now() + interval '30 minutes'
    ),
    'critical_open', count(*) filter (
      where priority = 'critical' and status in ('open', 'in_progress', 'waiting_customer')
    ),
    'high_open', count(*) filter (
      where priority = 'high' and status in ('open', 'in_progress', 'waiting_customer')
    ),
    'medium_open', count(*) filter (
      where priority = 'medium' and status in ('open', 'in_progress', 'waiting_customer')
    ),
    'low_open', count(*) filter (
      where priority = 'low' and status in ('open', 'in_progress', 'waiting_customer')
    )
  )
  from public.support_tickets
  where p_org_id is null or org_id = p_org_id;
$$;

create or replace function public.support_ticket_org_volume(p_limit integer default 5)
returns table (
  org_id uuid,
  org_name text,
  org_slug text,
  ticket_count bigint,
  critical_open bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tickets.org_id,
    orgs.name,
    orgs.slug,
    count(*)::bigint,
    count(*) filter (
      where tickets.priority = 'critical'
        and tickets.status in ('open', 'in_progress', 'waiting_customer')
    )::bigint
  from public.support_tickets as tickets
  join public.organizations as orgs on orgs.id = tickets.org_id
  group by tickets.org_id, orgs.name, orgs.slug
  order by count(*) desc, orgs.name
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

revoke all on function public.next_support_ticket_number() from public, anon, authenticated;
revoke all on function public.support_ticket_summary(uuid) from public, anon, authenticated;
revoke all on function public.support_ticket_org_volume(integer) from public, anon, authenticated;
grant execute on function public.next_support_ticket_number() to service_role;
grant execute on function public.support_ticket_summary(uuid) to service_role;
grant execute on function public.support_ticket_org_volume(integer) to service_role;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_events enable row level security;
alter table public.support_sla_policies enable row level security;
alter table public.support_sla_settings enable row level security;
alter table public.support_ticket_counters enable row level security;

drop policy if exists "Org members read support tickets" on public.support_tickets;
create policy "Org members read support tickets"
  on public.support_tickets for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members read public support messages" on public.support_ticket_messages;
create policy "Org members read public support messages"
  on public.support_ticket_messages for select
  using (org_id = public.current_user_org_id() and visibility = 'public');

drop policy if exists "Org members read support events" on public.support_ticket_events;
create policy "Org members read support events"
  on public.support_ticket_events for select
  using (org_id = public.current_user_org_id());
