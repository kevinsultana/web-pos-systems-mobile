-- Sync Supabase Auth → public.users (Prisma model)
-- Run this in Supabase SQL Editor if not already present.

create table if not exists public.users (
  id         uuid primary key references auth.users on delete cascade,
  email      text not null,
  name       text,
  phone      text,
  role       text not null default 'USER' check (role in ('USER', 'ADMIN', 'SUPER_ADMIN', 'CASHIER')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.users enable row level security;

-- Users can read/update their own row
create policy "Users can view own data"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own data"
  on public.users for update
  using (auth.uid() = id);

-- Cashier can view customer data for orders
create policy "Cashier can view users"
  on public.users for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'CASHIER'
    )
  );

-- Auto-create row on signup (email/password + Google OAuth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    'USER'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
