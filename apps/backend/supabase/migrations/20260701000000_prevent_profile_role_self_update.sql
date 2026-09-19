drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Users can update own profile except role" on public.profiles;

create policy "Users can update own profile except role"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role is not distinct from (
      select p.role
      from public.profiles p
      where p.id = auth.uid()
    )
  );
