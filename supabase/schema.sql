-- supabase/schema.sql
-- Run once in the Supabase SQL editor.

create table public.reels (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  caption text,
  summary text,
  category text check (category in ('business-idea', 'tool', 'other')),
  viability_score int check (viability_score between 1 and 5),
  viability_reasoning jsonb,
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  note text,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness lets the edge function find-or-create tools
-- by name without worrying about "CapCut" vs "capcut" duplicating rows.
create unique index tools_name_lower_idx on public.tools (lower(name));

create table public.reel_tools (
  reel_id uuid not null references public.reels(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  primary key (reel_id, tool_id)
);

alter table public.reels enable row level security;
alter table public.tools enable row level security;
alter table public.reel_tools enable row level security;

-- Reads are open (this is a personal tool gated by the app's passcode
-- screen, not by RLS). All writes go through the submit-reel edge function
-- using the service_role key, which bypasses RLS entirely — no anon
-- insert/update/delete policies exist on any of these tables.
create policy "reels are publicly readable" on public.reels
  for select to anon using (true);
create policy "tools are publicly readable" on public.tools
  for select to anon using (true);
create policy "reel_tools are publicly readable" on public.reel_tools
  for select to anon using (true);
