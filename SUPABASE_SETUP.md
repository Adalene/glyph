# Supabase Setup Guide

To connect your icon library to Supabase, follow these steps:

### 1. Create a Supabase Project
1. Go to [Supabase](https://supabase.com/) and sign in.
2. Click **"New Project"**.
3. Name it (e.g., `Glyph Icons`) and set a database password.

### 2. Create the Table
Once your project is ready, go to the **SQL Editor** in the left sidebar and run this script to create the `icons` table:

```sql
create table icons (
  id text primary key, -- The slug/id of the icon
  name text not null,
  category text not null,
  tags jsonb default '[]'::jsonb,
  path text not null,
  generated boolean default false,
  "generatedAt" bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table icons enable row level security;

-- Create a policy to allow anyone to read icons
create policy "Allow public read access"
  on icons for select
  using (true);

-- Create a policy to allow inserting icons (for our API)
-- Note: In a production app, you'd restrict this with more granular rules
create policy "Allow public insert"
  on icons for insert
  with check (true);
```

### 3. Get Your API Keys
1. Go to **Project Settings** > **API**.
2. Copy your **Project URL**.
3. Copy your `service_role` key (this key has admin privileges and should **ONLY** be used in the API, never the frontend).

### 4. Set Environment Variables
Add these to your **Vercel Project Settings** (and your local `.env` if you have one):

* `SUPABASE_URL`: Your Project URL
* `SUPABASE_SERVICE_ROLE_KEY`: Your service_role key
