-- Add interaction_count and memories to relationships table
-- interaction_count: persists across runner restarts so depth gating stays accurate
-- memories: last 5 key moments as JSON array, persisted for continuity

alter table relationships
  add column if not exists interaction_count int not null default 0,
  add column if not exists memories          jsonb not null default '[]'::jsonb;
