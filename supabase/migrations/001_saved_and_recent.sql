-- Saved recipes (user explicitly saved; 30 days or permanent)
create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe jsonb not null,
  saved_at timestamptz not null default now(),
  is_permanent boolean not null default false
);

alter table public.saved_recipes enable row level security;

create policy "Users can manage own saved recipes"
  on public.saved_recipes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Recently browsed (automatic history; cap in app)
create table if not exists public.recent_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe jsonb not null,
  viewed_at timestamptz not null default now()
);

alter table public.recent_recipes enable row level security;

create policy "Users can manage own recent recipes"
  on public.recent_recipes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional: index for listing by user + time
create index if not exists saved_recipes_user_saved_at on public.saved_recipes (user_id, saved_at desc);
create index if not exists recent_recipes_user_viewed_at on public.recent_recipes (user_id, viewed_at desc);
