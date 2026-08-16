-- QUERY NAME: 55-warranty-documents — Warranty document attachments
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 54-task-meta-descriptions.sql
-- ══════════════════════════════════════════════════════════════

create table if not exists public.warranty_documents (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  warranty_id uuid references public.warranties(id) on delete cascade not null,
  label text not null default 'other',
  file_name text not null,
  storage_path text not null,
  file_size integer,
  content_type text,
  sort_order integer not null default 1,
  created_at timestamptz default now()
);

create index if not exists idx_warranty_documents_warranty
  on public.warranty_documents(warranty_id, sort_order);

alter table public.warranty_documents enable row level security;

drop policy if exists "Org members read warranty documents" on public.warranty_documents;
create policy "Org members read warranty documents"
  on public.warranty_documents for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert warranty documents" on public.warranty_documents;
create policy "Org members insert warranty documents"
  on public.warranty_documents for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update warranty documents" on public.warranty_documents;
create policy "Org members update warranty documents"
  on public.warranty_documents for update
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members delete warranty documents" on public.warranty_documents;
create policy "Org members delete warranty documents"
  on public.warranty_documents for delete
  using (org_id = public.current_user_org_id());
