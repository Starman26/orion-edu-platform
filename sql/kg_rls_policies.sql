-- ============================================================================
-- RLS policies for the Knowledge Graph tables (lab.kg_nodes, lab.kg_edges)
--
-- Rule:
--   - Any team member (admin OR lab_researcher) can SELECT the graph for
--     teams they belong to.
--   - Only team admins (role IN ('admin','owner')) can INSERT / UPDATE / DELETE.
--
-- Run this once in the Supabase SQL Editor. Idempotent: drops existing
-- policies with the same names before re-creating them.
-- ============================================================================

-- Helper: is the calling user a member of this team?
create or replace function lab.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships m
    where m.team_id = p_team_id
      and m.auth_user_id = auth.uid()
  );
$$;

-- Helper: is the calling user an admin of this team?
create or replace function lab.is_team_admin(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships m
    where m.team_id = p_team_id
      and m.auth_user_id = auth.uid()
      and m.role in ('admin', 'owner')
  );
$$;

grant execute on function lab.is_team_member(uuid) to authenticated;
grant execute on function lab.is_team_admin(uuid)  to authenticated;

-- ============================================================================
-- kg_nodes
-- ============================================================================
alter table lab.kg_nodes enable row level security;

drop policy if exists kg_nodes_select on lab.kg_nodes;
drop policy if exists kg_nodes_insert on lab.kg_nodes;
drop policy if exists kg_nodes_update on lab.kg_nodes;
drop policy if exists kg_nodes_delete on lab.kg_nodes;

create policy kg_nodes_select on lab.kg_nodes
  for select
  to authenticated
  using ( lab.is_team_member(team_id) );

create policy kg_nodes_insert on lab.kg_nodes
  for insert
  to authenticated
  with check ( lab.is_team_admin(team_id) );

create policy kg_nodes_update on lab.kg_nodes
  for update
  to authenticated
  using      ( lab.is_team_admin(team_id) )
  with check ( lab.is_team_admin(team_id) );

create policy kg_nodes_delete on lab.kg_nodes
  for delete
  to authenticated
  using ( lab.is_team_admin(team_id) );

-- ============================================================================
-- kg_edges
-- ============================================================================
alter table lab.kg_edges enable row level security;

drop policy if exists kg_edges_select on lab.kg_edges;
drop policy if exists kg_edges_insert on lab.kg_edges;
drop policy if exists kg_edges_update on lab.kg_edges;
drop policy if exists kg_edges_delete on lab.kg_edges;

create policy kg_edges_select on lab.kg_edges
  for select
  to authenticated
  using ( lab.is_team_member(team_id) );

create policy kg_edges_insert on lab.kg_edges
  for insert
  to authenticated
  with check ( lab.is_team_admin(team_id) );

create policy kg_edges_update on lab.kg_edges
  for update
  to authenticated
  using      ( lab.is_team_admin(team_id) )
  with check ( lab.is_team_admin(team_id) );

create policy kg_edges_delete on lab.kg_edges
  for delete
  to authenticated
  using ( lab.is_team_admin(team_id) );
