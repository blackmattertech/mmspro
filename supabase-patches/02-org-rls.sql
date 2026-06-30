-- Allow authenticated users to read their own organization
alter table organizations enable row level security;

drop policy if exists "Members can view own organization" on organizations;
create policy "Members can view own organization"
  on organizations for select
  using (
    id = (select org_id from profiles where id = auth.uid())
  );
