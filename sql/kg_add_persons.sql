-- ============================================================================
-- Add 'person' node kind and person-related relations to the Knowledge Graph.
--
-- Run once in the Supabase SQL Editor. Idempotent: drops existing CHECK
-- constraints (by their conventional names) before re-creating them with the
-- expanded value set. If your constraint names differ, list them first with:
--
--   select conname
--   from pg_constraint
--   where conrelid = 'lab.kg_nodes'::regclass and contype = 'c';
--
-- and adjust the DROP statements accordingly.
-- ============================================================================

-- kg_nodes.kind — add 'person'
alter table lab.kg_nodes drop constraint if exists kg_nodes_kind_check;
alter table lab.kg_nodes
  add constraint kg_nodes_kind_check
  check (kind in ('equipment','space','concept','process','material','person'));

-- kg_edges.relation — add responsible_for / operates / supervises / member_of
alter table lab.kg_edges drop constraint if exists kg_edges_relation_check;
alter table lab.kg_edges
  add constraint kg_edges_relation_check
  check (relation in (
    'controls','monitors','located_in','connects_to','is_a','part_of','related_to',
    'responsible_for','operates','supervises','member_of'
  ));
