# Supabase Setup Guide

To connect your icon library to Supabase, follow these steps:

### 1. Create a Supabase Project
1. Go to [Supabase](https://supabase.com/) and sign in.
2. Click **"New Project"**.
3. Name it (e.g., `Glyph Icons`) and set a database password.

### 2. Create the Table
Once your project is ready, go to the **SQL Editor** in the left sidebar and run this script to create the `icons` table. This script is "idempotent," meaning you can run it multiple times without errors:

```sql
-- 1. Create the table (only if it doesn't already exist)
create table if not exists icons (
  id text primary key, -- The slug/id of the icon
  name text not null,
  category text not null,
  tags jsonb default '[]'::jsonb,
  path text not null,
  generated boolean default false,
  "generatedAt" bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS)
alter table icons enable row level security;

-- 3. Create policies (wrapped in a block to avoid "already exists" errors)
do $$ 
begin
  if not exists (select 1 from pg_policies where policyname = 'Allow public read access') then
    create policy "Allow public read access" on icons for select using (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Allow public insert') then
    create policy "Allow public insert" on icons for insert with check (true);
  end if;
end $$;
```

### 3. Create the Eval Runs Table

Run this in the SQL Editor to store evaluation results (idempotent):

```sql
-- 1. Create the eval_runs table
create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default timezone('utc', now()) not null,
  total integer not null,
  passed integer not null,
  dry_run boolean default false,
  summary jsonb default '{}'::jsonb,
  results jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc', now()) not null
);

-- 2. Enable RLS
alter table eval_runs enable row level security;

-- 3. Public read + insert policies
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'eval_runs' and policyname = 'Allow public read eval_runs') then
    create policy "Allow public read eval_runs" on eval_runs for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'eval_runs' and policyname = 'Allow public insert eval_runs') then
    create policy "Allow public insert eval_runs" on eval_runs for insert with check (true);
  end if;
end $$;
```

### 4. Get Your API Keys
1. Go to **Project Settings** > **API**.
2. Copy your **Project URL**.
3. Copy your `service_role` key (this key has admin privileges and should **ONLY** be used in the API, never the frontend).

### 4. Set Environment Variables
Add these to your **Vercel Project Settings** (and your local `.env` if you have one):

* `SUPABASE_URL`: Your Project URL
* `SUPABASE_SERVICE_ROLE_KEY`: Your service_role key
